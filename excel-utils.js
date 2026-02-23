// excel-utils.js

const EXCEL_HEADERS = [
    "สำนักงานภาค (Region)",
    "หน่วย (Unit)",
    "ประเภทโครงการ (01-04)",
    "รายการย่อย",
    "มิติงาน",
    "หมู่ที่",
    "บ้าน",
    "ตำบล",
    "อำเภอ",
    "จังหวัด",
    "ประเภทงบประมาณ",
    "งบประมาณ (บาท)",
    "รหัสศูนย์ต้นทุน",
    "รหัสแหล่งของเงิน",
    "รหัสงบประมาณ",
    "รหัสกิจกรรมหลัก",
    "รหัสกิจกรรมย่อย",
    "รหัสงบประมาณ บก.ทท.",
    "รหัสงบประมาณ นทพ."
];

document.addEventListener('DOMContentLoaded', () => {
    const btnDownload = document.getElementById('btnDownloadTemplate');
    const fileInput = document.getElementById('excelFileInput');

    if (btnDownload) {
        btnDownload.addEventListener('click', downloadTemplate);
    }

    if (fileInput) {
        fileInput.addEventListener('change', handleFileUpload);
    }
});

function downloadTemplate() {
    // Create a new workbook
    const wb = XLSX.utils.book_new();

    // Create worksheet with headers
    const ws = XLSX.utils.aoa_to_sheet([EXCEL_HEADERS]);

    // Add some column widths for better UX
    const wscols = EXCEL_HEADERS.map(h => ({ wch: Math.max(15, h.length + 5) }));
    ws['!cols'] = wscols;

    // Append worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, "Template");

    // Save file
    XLSX.writeFile(wb, "Project_Import_Template.xlsx");
}

// Global array to hold valid rows waiting for import
let pendingValidProjects = [];

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            // Assume the first sheet is the one we want
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // Convert to JSON (array of arrays)
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            // Remove header row
            const rows = jsonData.slice(1);

            let validCount = 0;
            let invalidCount = 0;
            let previewHTML = '';

            pendingValidProjects = []; // Reset pending list

            rows.forEach((row, index) => {
                if (row.length === 0 || !row[0]) return; // Skip visibly empty rows

                const rowNum = index + 2; // +1 for 0-index, +1 for header row
                let status = 'ready';
                let errorMsg = [];
                let projectData = null;

                try {
                    // Removed formatting restrictions as per user request to allow any format
                    let rtarfFormatted = String(row[17] || "").trim();
                    let afdcFormatted = String(row[18] || "").trim();
                    projectData = {
                        region: String(row[0] || "").trim(),
                        unit: String(row[1] || "").trim(),
                        projectType: String(row[2]).padStart(2, '0').trim() || "",
                        subItem: String(row[3] || "").trim(),
                        workDim: String(row[4] || "").trim(),
                        location: {
                            moo: String(row[5] || "").trim(),
                            village: String(row[6] || "").trim(),
                            tambon: String(row[7] || "").trim(),
                            amphoe: String(row[8] || "").trim(),
                            province: String(row[9] || "").trim()
                        },
                        budgetType: String(row[10] || "").trim(),
                        budgetAmount: parseFloat(row[11]) || 0,
                        costCenter: String(row[12] || "").trim(),
                        fundingSource: String(row[13] || "").trim(),
                        budgetCode: String(row[14] || "").trim(),
                        mainActivity: String(row[15] || "").trim(),
                        subActivity: String(row[16] || "").trim(),
                        rtarfCode: rtarfFormatted,
                        afdcCode: afdcFormatted
                    };

                    // Validation Checks
                    if (!projectData.region) errorMsg.push("ไม่ได้ระบุสำนักงานภาค");
                    else if (!systemSettings.regions.includes(projectData.region)) errorMsg.push(`ไม่มีสำนักงานภาค '${projectData.region}' ในระบบ`);

                    if (projectData.region && !projectData.unit) errorMsg.push("ไม่ได้ระบุหน่วย");
                    else if (projectData.region && systemSettings.units[projectData.region]) {
                        if (!systemSettings.units[projectData.region].includes(projectData.unit)) {
                            errorMsg.push(`ภาค ${projectData.region} ไม่มีหน่วย '${projectData.unit}'`);
                        }
                    }

                    const validTypes = systemSettings.projectTypes.map(pt => pt.code);
                    if (!projectData.projectType) errorMsg.push("ไม่ได้ระบุรหัสประเภทโครงการ");
                    else if (!validTypes.includes(projectData.projectType)) errorMsg.push(`รหัสประเภทโครงการ '${projectData.projectType}' ไม่ถูกต้อง`);

                    // Check budget Amount
                    if (projectData.budgetAmount <= 0) errorMsg.push("ยอดงบประมาณต้องมากกว่า 0");

                } catch (err) {
                    errorMsg.push("ข้อผิดพลาดในการอ่านข้อมูล: " + err.message);
                }

                if (errorMsg.length > 0) {
                    status = 'error';
                    invalidCount++;
                } else {
                    validCount++;
                    pendingValidProjects.push(projectData);
                }

                // Append to preview table html
                const statusBadge = status === 'ready'
                    ? '<span class="badge badge-success" style="white-space:nowrap;"><i class="fa-solid fa-check"></i> พร้อมนำเข้า</span>'
                    : '<span class="badge badge-danger" style="white-space:nowrap;"><i class="fa-solid fa-xmark"></i> พบข้อผิดพลาด</span>';

                const notes = errorMsg.length > 0
                    ? `<ul style="margin:0; padding-left:16px; color: var(--danger); font-size: 0.85em;"><li>${errorMsg.join('</li><li>')}</li></ul>`
                    : '<span style="color:var(--text-muted); font-size: 0.85em;">-</span>';

                previewHTML += `
                    <tr style="${status === 'error' ? 'background: rgba(244, 63, 94, 0.05);' : ''}">
                        <td style="text-align:center;">${rowNum}</td>
                        <td>${statusBadge}</td>
                        <td>
                            <div style="font-weight: 500; font-size: 0.9em;">${projectData.projectType} ${projectData.subItem}</div>
                            <div style="color: var(--text-muted); font-size: 0.8em;">มิติงาน: ${projectData.workDim || '-'}</div>
                        </td>
                        <td>
                            <div style="font-size: 0.9em;">${projectData.region || '-'}</div>
                            <div style="color: var(--text-muted); font-size: 0.8em;">${projectData.unit || '-'}</div>
                        </td>
                        <td>${notes}</td>
                    </tr>
                `;
            });

            // Populate Modal
            document.getElementById('previewTotalCount').innerText = validCount + invalidCount;
            document.getElementById('previewValidCount').innerText = validCount;
            document.getElementById('previewInvalidCount').innerText = invalidCount;
            document.getElementById('excelPreviewTableBody').innerHTML = previewHTML || '<tr><td colspan="5" style="text-align:center;">ไม่พบข้อมูลในไฟล์</td></tr>';
            document.getElementById('btnConfirmCount').innerText = `(${validCount} รายการ)`;

            const confirmBtn = document.getElementById('btnConfirmExcelImport');
            if (validCount === 0) {
                confirmBtn.disabled = true;
                confirmBtn.style.opacity = '0.5';
                confirmBtn.style.cursor = 'not-allowed';
            } else {
                confirmBtn.disabled = false;
                confirmBtn.style.opacity = '1';
                confirmBtn.style.cursor = 'pointer';
            }

            // Show Modal
            document.getElementById('excelPreviewModal').style.display = 'flex';

        } catch (error) {
            alert('เกิดข้อผิดพลาดในการอ่านไฟล์ กรุณาตรวจสอบรูปแบบไฟล์ Excel');
            console.error(error);
        } finally {
            // Reset input so the same file can be uploaded again if needed
            const fileInput = document.getElementById('excelFileInput');
            if (fileInput) fileInput.value = '';
        }
    };

    reader.readAsArrayBuffer(file);
}

function closeExcelPreview() {
    document.getElementById('excelPreviewModal').style.display = 'none';
    pendingValidProjects = [];
}

function confirmExcelImport() {
    if (pendingValidProjects.length === 0) return;

    let addedCount = 0;
    // Add fiscal year implicitly as current budget year unless specified? The template doesn't have it, we assume current year.
    const currentBEYear = new Date().getFullYear() + 543;
    const assumedFiscalYear = (currentBEYear + 1).toString(); // Often fiscal year is +1 from calendar depending on month, let's just use dropdown logic or prompt.
    // Actually, getting it from the dropdown if it exists on page. If not, default.
    const fySelect = document.getElementById('fieldFiscalYear');
    const selectedFy = fySelect ? (fySelect.value || assumedFiscalYear) : assumedFiscalYear;

    pendingValidProjects.forEach(proj => {
        if (!proj.fiscalYear) proj.fiscalYear = selectedFy;
        addProject(proj);
        addedCount++;
    });

    closeExcelPreview();
    alert(`นำเข้าข้อมูลสำเร็จ ${addedCount} โครงการ`);

    // Optional: redirect to budget-management or reload
    window.location.href = 'budget-management.html';
}
