const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const cors = require('cors');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.static('public'));

// Process Excel or CSV file
function processFile(buffer, filename) {
    // Determine file type and read accordingly
    const workbook = XLSX.read(buffer, {
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

    // Get header row and find required column indices
    const headers = data[0].map(h => String(h || '').toLowerCase().trim());
    console.log('Headers found:', headers);

    // Find column indices
    const columnIndices = {
        name: headers.findIndex(h => h.includes('customer_name')),
        serialNo: headers.findIndex(h => h.includes('serial_num')),
        date: headers.findIndex(h => h.includes('service_end_date')),
        address: headers.findIndex(h => h.includes('address'))
    };

    console.log('Column indices:', columnIndices);

    // Validate required columns exist
    const missingColumns = [];
    Object.entries(columnIndices).forEach(([key, value]) => {
        if (value === -1) {
            missingColumns.push(key);
        }
    });

    if (missingColumns.length > 0) {
        throw new Error(`Required columns not found: ${missingColumns.join(', ')}`);
    }

    // Extract data using found column indices
    let processedData = data.slice(1).map(row => ({
        Name: row[columnIndices.name],
        SerialNo: row[columnIndices.serialNo],
        DeactivationDate: row[columnIndices.date],
        Address: row[columnIndices.address]
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

    // Create new workbook
    const newWorkbook = XLSX.utils.book_new();

    // Add sheets
    Object.entries(categorized).forEach(([sheetName, data]) => {
        if (data.length > 0) {
            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(newWorkbook, ws, sheetName);
        }
    });

    // Generate buffer
    const outputBuffer = XLSX.write(newWorkbook, { type: 'buffer', bookType: 'xlsx' });

    return {
        buffer: outputBuffer,
        stats: {
            'A Apartment': categorized['A Apartment'].length,
            'B Apartment': categorized['B Apartment'].length,
            'C Apartment': categorized['C Apartment'].length,
            'Others': categorized['Others'].length
        }
    };
}

app.post('/process', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const result = processFile(req.file.buffer, req.file.originalname);

        // Set headers for file download
        res.setHeader('Content-Type', 'application/json');
        res.json({
            fileData: result.buffer.toString('base64'),
            stats: result.stats,
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