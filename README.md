# CSV File Processor

A web application that processes CSV files containing customer and apartment data. The application removes duplicates, filters unwanted entries, sorts by date, and categorizes entries by apartment type.

## Features

- Drag-and-drop file upload
- Support for CSV files
- Removes duplicate entries based on Name and Serial Number
- Filters out entries containing 'z1', 'z', 'kap', or 'ang'
- Sorts by date in ascending order
- Categorizes entries by apartment type (A, B, C, Others)
- Downloads processed data as Excel file with multiple sheets

## Required CSV Format

The input CSV file should contain the following columns:
- CAF
- Customer_ID
- Customer_Name
- Reseller_Customer_ID Mobile
- Business_Partner
- LCO_Balance
- Serial_Num
- Mac_Vc_Number
- Server_Type
- Product
- Service_End_Date
- address
- lco_name
- lco_code
- lco_city

## Setup

1. Clone the repository:
```bash
git clone [repository-url]
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
node server.js
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

## Dependencies

- Express.js
- XLSX (for reading CSV and generating Excel output)
- Multer
- CORS
- Tailwind CSS (via CDN)

## Output

The processed file (processed_stock.xlsx) will contain the following sheets:
- All Records
- A Apartment
- B Apartment
- C Apartment
- Others (if any) 