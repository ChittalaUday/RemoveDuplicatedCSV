const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const cors = require('cors');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.static('public'));

// Validate CSV structure and content
function validateCSVContent(data) {
    if (!Array.isArray(data) || data.length < 2) {
        throw new Error('Invalid CSV format: File appears to be empty or malformed');
    }

    // Skip the "Report Generated" row if it exists
    if (data[0] && String(data[0][0] || '').toLowerCase().includes('report generated')) {
        data = data.slice(1);
    }

    // Get header row and validate
    const headers = data[0].map(h => String(h || '').toLowerCase().trim());

    // Required columns and their possible variations
    const requiredColumns = {
        'customer_name': ['customer_name', 'customer name', 'customername', 'name'],
        'serial_num': ['serial_num', 'serial number', 'serialnumber', 'serial'],
        'service_end_date': ['service_end_date', 'end date', 'service end', 'deactivation date'],
        'address': ['address', 'addr', 'location']
    };

    // Check for required columns
    const missingColumns = [];
    const columnIndices = {};

    for (const [key, variations] of Object.entries(requiredColumns)) {
        const index = variations.reduce((found, variation) => {
            if (found !== -1) return found;
            return headers.findIndex(h => h.includes(variation));
        }, -1);

        if (index === -1) {
            missingColumns.push(key);
        } else {
            columnIndices[key] = index;
        }
    }

    if (missingColumns.length > 0) {
        throw new Error(`Required columns not found: ${missingColumns.join(', ')}`);
    }

    return { headers, columnIndices };
}

// Preview input file
app.post('/preview-input', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const workbook = XLSX.read(req.file.buffer, {
            type: 'buffer',
            raw: true,
            cellDates: true,
            cellNF: false,
            cellText: false
        });

        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        let data = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

        // Skip the "Report Generated" row if it exists
        if (data[0] && String(data[0][0] || '').toLowerCase().includes('report generated')) {
            data = data.slice(1);
        }

        // Convert array to object with headers
        const headers = data[0];
        const rows = data.slice(1).map(row => {
            const obj = {};
            headers.forEach((header, index) => {
                obj[header] = row[index] || '';
            });
            return obj;
        });

        res.json(rows);
    } catch (error) {
        console.error('Error previewing file:', error);
        res.status(500).json({ error: error.message || 'Error previewing file' });
    }
});

// Process CSV file
function processFile(buffer, filename) {
    // Try to read the file as CSV
    let workbook;
    try {
        workbook = XLSX.read(buffer, {
            type: 'buffer',
            raw: true,
            cellDates: true,
            cellNF: false,
            cellText: false
        });
    } catch (error) {
        throw new Error('Invalid file format: Unable to read as CSV');
    }

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('Invalid file format: No data found');
    }

    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    let data = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

    // Validate CSV structure and get column indices
    const { columnIndices } = validateCSVContent(data);

    // Extract data using found column indices
    let processedData = data.slice(1).map(row => ({
        Name: row[columnIndices['customer_name']],
        SerialNo: row[columnIndices['serial_num']],
        DeactivationDate: row[columnIndices['service_end_date']],
        Address: row[columnIndices['address']]
    })).filter(row => row.Name && row.SerialNo); // Filter out rows with missing required data

    // Remove rows with unwanted patterns
    const patterns = ['z1', 'z', 'kap', 'ang'].map(p => new RegExp(p, 'i'));
    processedData = processedData.filter(row => {
        const rowString = Object.values(row).join(' ').toLowerCase();
        return !patterns.some(pattern => pattern.test(rowString));
    });

    // Convert dates and sort
    processedData = processedData.map(row => ({
        ...row,
        DeactivationDate: row.DeactivationDate ? new Date(row.DeactivationDate) : null
    }));
    processedData.sort((a, b) => {
        if (!a.DeactivationDate) return 1;
        if (!b.DeactivationDate) return -1;
        return a.DeactivationDate - b.DeactivationDate;
    });

    // Remove duplicates
    const seen = new Set();
    processedData = processedData.filter(row => {
        const key = `${row.Name}-${row.SerialNo}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Format dates back to string
    processedData = processedData.map(row => ({
        ...row,
        DeactivationDate: row.DeactivationDate ?
            row.DeactivationDate.toLocaleDateString('en-GB') : ''
    }));

    // Categorize by apartment type
    const categorized = {
        'All Records': processedData,
        'A Apartment': processedData.filter(row => /a/i.test(row.Address)),
        'B Apartment': processedData.filter(row => /b/i.test(row.Address)),
        'C Apartment': processedData.filter(row => /c/i.test(row.Address)),
        'Others': processedData.filter(row => !/[abc]/i.test(row.Address))
    };

    // Create new workbook for output
    const newWorkbook = XLSX.utils.book_new();

    // Add sheets
    Object.entries(categorized).forEach(([sheetName, data]) => {
        if (data.length > 0) {
            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(newWorkbook, ws, sheetName);
        }
    });

    // Create sheets data for preview
    const sheetsData = {};
    Object.entries(categorized).forEach(([sheetName, data]) => {
        if (data.length > 0) {
            sheetsData[sheetName] = data;
        }
    });

    // Generate buffer for download
    const outputBuffer = XLSX.write(newWorkbook, { type: 'buffer', bookType: 'xlsx' });

    return {
        buffer: outputBuffer,
        stats: {
            'A Apartment': categorized['A Apartment'].length,
            'B Apartment': categorized['B Apartment'].length,
            'C Apartment': categorized['C Apartment'].length,
            'Others': categorized['Others'].length
        },
        sheets: sheetsData
    };
}

app.post('/process', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const result = processFile(req.file.buffer, req.file.originalname);

        res.setHeader('Content-Type', 'application/json');
        res.json({
            fileData: result.buffer.toString('base64'),
            stats: result.stats,
            sheets: result.sheets,
            filename: 'processed_stock.xlsx'
        });
    } catch (error) {
        console.error('Error processing file:', error);
        res.status(500).json({ error: error.message || 'Error processing file' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 