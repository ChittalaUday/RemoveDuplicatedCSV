import pandas as pd
from datetime import datetime

def process_excel():
    # Read the Excel file
    df = pd.read_excel('Stock upload.xlsx')
    
    # Create a copy with only required columns
    df_processed = df.iloc[:, [2, 7, 11, 12]].copy()  # Columns C, H, L, M (0-based indexing)
    
    # Rename columns for clarity
    df_processed.columns = ['Name', 'Serial No', 'Deactivation Date', 'Address']
    
    # Convert Deactivation Date to datetime after selecting columns
    df_processed['Deactivation Date'] = pd.to_datetime(df_processed['Deactivation Date'], errors='coerce')
    
    # Create a mask for filtering out unwanted patterns
    patterns = '|'.join(['z1', 'z', 'kap', 'ang'])
    mask = ~df_processed.astype(str).apply(lambda x: x.str.contains(patterns, case=False, na=False)).any(axis=1)
    df_processed = df_processed[mask]
    
    # Sort by date in ascending order
    df_processed = df_processed.sort_values('Deactivation Date', ascending=True)
    
    # Remove duplicates based on Name and Serial No, keeping the first occurrence (which is the earliest date due to sorting)
    df_processed = df_processed.drop_duplicates(subset=['Name', 'Serial No'], keep='first')
    
    # Format the date to show only date with '/'
    df_processed['Deactivation Date'] = df_processed['Deactivation Date'].dt.strftime('%d/%m/%Y')
    
    # Create separate dataframes for each apartment type
    df_a = df_processed[df_processed['Address'].str.contains('A', case=False, na=False)]
    df_b = df_processed[df_processed['Address'].str.contains('B', case=False, na=False)]
    df_c = df_processed[df_processed['Address'].str.contains('C', case=False, na=False)]
    df_others = df_processed[~(
        df_processed['Address'].str.contains('A', case=False, na=False) |
        df_processed['Address'].str.contains('B', case=False, na=False) |
        df_processed['Address'].str.contains('C', case=False, na=False)
    )]
    
    # Save to Excel with multiple sheets
    output_filename = 'processed_stock.xlsx'
    with pd.ExcelWriter(output_filename, engine='openpyxl') as writer:
        df_processed.to_excel(writer, sheet_name='All Records', index=False)
        df_a.to_excel(writer, sheet_name='A Apartment', index=False)
        df_b.to_excel(writer, sheet_name='B Apartment', index=False)
        df_c.to_excel(writer, sheet_name='C Apartment', index=False)
        if not df_others.empty:
            df_others.to_excel(writer, sheet_name='Others', index=False)
    
    print(f"Processed file saved as: {output_filename}")
    print(f"A Apartment records: {len(df_a)}")
    print(f"B Apartment records: {len(df_b)}")
    print(f"C Apartment records: {len(df_c)}")
    print(f"Other records: {len(df_others)}")

if __name__ == "__main__":
    process_excel() 