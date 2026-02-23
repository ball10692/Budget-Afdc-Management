/**
 * AFDC Budget Management System - Google Sheets API
 * 
 * Instructions:
 * 1. Create a new Google Sheet.
 * 2. Go to Extensions > Apps Script.
 * 3. Copy and paste this entire code into Code.gs.
 * 4. Click Deploy > New deployment.
 * 5. Select type: "Web app".
 * 6. Execute as: "Me".
 * 7. Who has access: "Anyone".
 * 8. Click Deploy.
 * 9. Authorize the permissions.
 * 10. Copy the Web app URL and paste it into js/app.js (GOOGLE_API_URL).
 */

const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

// Sheet Names
const SHEET_PROJECTS = "Projects";
const SHEET_TRANSACTIONS = "Transactions";
const SHEET_USERS = "Users";
const SHEET_SETTINGS = "Settings";

// Generic Setup Function
function setupSheets() {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    createSheetIfNotExists(ss, SHEET_PROJECTS, [
        "id", "createdAt", "fiscalYear", "region", "unit", "projectType",
        "subItem", "workDim", "location", "budgetAmount", "budgetType",
        "costCenter", "fundingSource", "budgetCode", "mainActivity",
        "subActivity", "rtarfCode", "afdcCode", "remainingBudget"
    ]);

    createSheetIfNotExists(ss, SHEET_TRANSACTIONS, [
        "id", "projectId", "type", "amount", "description", "month", "timestamp"
    ]);

    createSheetIfNotExists(ss, SHEET_USERS, [
        "id", "username", "password", "displayName", "role", "createdAt"
    ]);

    // Seed default admin if Users sheet is empty
    const userSheet = ss.getSheetByName(SHEET_USERS);
    if (userSheet.getLastRow() <= 1) {
        userSheet.appendRow([
            "admin",
            "admin",
            "admin",
            "ผู้ดูแลระบบ",
            "admin",
            new Date().toISOString()
        ]);
    }

    createSheetIfNotExists(ss, SHEET_SETTINGS, [
        "key", "value"
    ]);

    return "Setup complete. Sheets created/verified.";
}

function createSheetIfNotExists(ss, sheetName, headers) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
        sheet = ss.insertSheet(sheetName);
        if (headers && headers.length > 0) {
            sheet.appendRow(headers);
        }
    }
}

// -------------------------------------------------------------
// POST Request Handler
// -------------------------------------------------------------
function doPost(e) {
    try {
        const postData = JSON.parse(e.postData.contents);
        const action = postData.action;

        if (!action) {
            return responseJson({ error: "No action specified" }, 400);
        }

        let result;

        switch (action) {
            case "saveData":
                // Saves Projects and Transactions
                result = handleSaveData(postData.projects, postData.transactions);
                break;
            case "saveSettings":
                result = handleSaveSettings(postData.settings);
                break;
            case "saveUsers":
                result = handleSaveUsers(postData.users);
                break;
            case "initData":
                setupSheets(); // Ensure sheets exist
                result = getInitialData();
                break;
            case "addProject":
                result = handleAddRow(SHEET_PROJECTS, postData.project);
                break;
            case "updateProject":
                result = handleUpdateRow(SHEET_PROJECTS, postData.project);
                break;
            case "addTransaction":
                result = handleAddRow(SHEET_TRANSACTIONS, postData.transaction);
                break;
            case "deleteUser": // Just in case user deletion is needed later
                result = handleDeleteRow(SHEET_USERS, postData.userId);
                break;
            default:
                return responseJson({ error: "Invalid action" }, 400);
        }

        return responseJson({ success: true, data: result });

    } catch (error) {
        return responseJson({ success: false, error: error.toString() }, 500);
    }
}

// -------------------------------------------------------------
// GET Request Handler (mostly for testing/ping)
// -------------------------------------------------------------
function doGet(e) {
    const action = e.parameter.action;

    if (action === "setup") {
        const msg = setupSheets();
        return ContentService.createTextOutput(msg);
    }

    if (action === "test") {
        return responseJson({ status: "ok", message: "API is working" });
    }

    // Allow getting full data via GET for initialization if needed
    if (action === "initData") {
        try {
            setupSheets();
            return responseJson({ success: true, data: getInitialData() });
        } catch (err) {
            return responseJson({ success: false, error: err.toString() }, 500);
        }
    }

    return responseJson({ success: false, error: "Missing or invalid action" });
}

// -------------------------------------------------------------
// API Actions
// -------------------------------------------------------------

function getInitialData() {
    const projects = getSheetDataAsObjects(SHEET_PROJECTS);
    const transactions = getSheetDataAsObjects(SHEET_TRANSACTIONS);
    const users = getSheetDataAsObjects(SHEET_USERS);

    // Parse nested JSON fields back to objects
    projects.forEach(p => {
        if (typeof p.location === 'string' && p.location.startsWith('{')) {
            try { p.location = JSON.parse(p.location); } catch (e) { p.location = {}; }
        }
    });

    const rawSettings = getSheetDataAsObjects(SHEET_SETTINGS);
    let systemSettings = null;
    if (rawSettings.length > 0) {
        const settingRow = rawSettings.find(r => r.key === 'systemSettings');
        if (settingRow && settingRow.value) {
            try { systemSettings = JSON.parse(settingRow.value); } catch (e) { }
        }
    }

    return {
        projects: projects || [],
        transactions: transactions || [],
        users: users || [],
        systemSettings: systemSettings
    };
}

function handleSaveData(projectsData, transactionsData) {
    if (projectsData) {
        overwriteSheetData(SHEET_PROJECTS, projectsData);
    }
    if (transactionsData) {
        overwriteSheetData(SHEET_TRANSACTIONS, transactionsData);
    }
    return "Data saved";
}

function handleSaveSettings(settingsData) {
    if (settingsData) {
        // We store settings as a single JSON string row to handle complex nested structure easily
        const data = [{ key: "systemSettings", value: JSON.stringify(settingsData) }];
        overwriteSheetData(SHEET_SETTINGS, data);
    }
    return "Settings saved";
}

function handleSaveUsers(usersData) {
    if (usersData) {
        overwriteSheetData(SHEET_USERS, usersData);
    }
    return "Users saved";
}

function handleAddRow(sheetName, item) {
    if (!item) return "No data provided";
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return "Sheet not found";

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    const row = [];
    for (let h = 0; h < headers.length; h++) {
        let val = item[headers[h]];
        if (typeof val === 'object' && val !== null) {
            val = JSON.stringify(val);
        }
        row.push(val !== undefined ? val : "");
    }

    sheet.appendRow(row);
    return "Row added";
}

function handleUpdateRow(sheetName, item) {
    if (!item || !item.id) return "No ID provided";
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return "Sheet not found";

    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const headers = values[0];
    const idIndex = headers.indexOf("id");

    if (idIndex === -1) return "ID column not found";

    for (let r = 1; r < values.length; r++) {
        if (values[r][idIndex] === item.id) {
            const rowValues = [];
            for (let c = 0; c < headers.length; c++) {
                let val = item[headers[c]];
                if (val === undefined) {
                    val = values[r][c]; // Keep existing
                } else if (typeof val === 'object' && val !== null) {
                    val = JSON.stringify(val);
                }
                rowValues.push(val !== undefined ? val : "");
            }
            sheet.getRange(r + 1, 1, 1, headers.length).setValues([rowValues]);
            return "Row updated";
        }
    }
    return "Row not found";
}

function handleDeleteRow(sheetName, id) {
    if (!id) return "No ID provided";
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return "Sheet not found";

    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const headers = values[0];
    const idIndex = headers.indexOf("id");

    if (idIndex === -1) return "ID column not found";

    for (let r = 1; r < values.length; r++) {
        if (values[r][idIndex] === id) {
            sheet.deleteRow(r + 1);
            return "Row deleted";
        }
    }
    return "Row not found";
}

// -------------------------------------------------------------
// Utility Functions
// -------------------------------------------------------------

function responseJson(data, statusCode = 200) {
    return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
}

function getSheetDataAsObjects(sheetName) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];

    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();

    if (values.length <= 1) return []; // Empty or only headers

    const headers = values[0];
    const results = [];

    for (let r = 1; r < values.length; r++) {
        const row = values[r];
        const obj = {};
        for (let c = 0; c < headers.length; c++) {
            let val = row[c];
            // Convert empty strings to null or keep them
            obj[headers[c]] = val;
        }
        results.push(obj);
    }

    return results;
}

function overwriteSheetData(sheetName, dataObjects) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(sheetName);

    // Clear existing content (keeping headers formatting by clearing start from row 2 ideally)
    // Easiest is to clear everything and rewrite headers
    sheet.clearContents();

    if (!dataObjects || dataObjects.length === 0) {
        return; // Nothing to write
    }

    // Get headers from first object or default
    const headers = Object.keys(dataObjects[0]);

    const rows = [headers];

    for (let i = 0; i < dataObjects.length; i++) {
        const rowObj = dataObjects[i];
        const row = [];
        for (let h = 0; h < headers.length; h++) {
            let val = rowObj[headers[h]];
            // Stringify nested objects
            if (typeof val === 'object' && val !== null) {
                val = JSON.stringify(val);
            }
            row.push(val);
        }
        rows.push(row);
    }

    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}
