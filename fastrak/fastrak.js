function parseCSV() {
    const csvText = document.getElementById('csvInput').value;
    
    const rows = csvText.split('\n');
    const rawHeaders = rows[0].split(',').filter(header => header.trim() !== '');
    const { headers, reorderMap, dateIndex, debitIndex } = reorderColumns(rawHeaders);

    // Create a map to store transactions by date
    const transactionsByDate = new Map();

    // Process each row (skip header)
    for (let i = 1; i < rows.length; i++) {
        if (rows[i].trim() === '') continue;
        
        const rawCells = rows[i].split(',');
        // Only take the cells we need based on reorderMap
        const cells = reorderMap.map(i => rawCells[i]?.trim() || '');

        const date = cells[dateIndex];
        const debit = parseFloat(cells[debitIndex]?.replace('$', '')) || 0;

        if (debit > 0.0001) {
            if (!transactionsByDate.has(date)) {
                transactionsByDate.set(date, {
                    transactions: [],
                    totalDebit: 0
                });
            }

            transactionsByDate.get(date).transactions.push(cells);
            transactionsByDate.get(date).totalDebit += debit;
        }
    }

    // Sort rows by TRANSACTION TIME in descending order
    const timeIndex = headers.findIndex(h => h.trim() === 'TRANSACTION TIME');
    if (timeIndex !== -1) {
        transactionsByDate.forEach(data => {
            data.transactions.sort((a, b) => {
                // Compare times in HH:MM format
                const timeA = convertTo24Hour(a[timeIndex]);
                const timeB = convertTo24Hour(b[timeIndex]);
                return timeA.localeCompare(timeB);
            });
        });
    }

    // Create HTML output
    let outputHTML = '';
    const sortedDates = Array.from(transactionsByDate.entries())
        .sort((a, b) => new Date(b[0]) - new Date(a[0]));
        
    sortedDates.forEach(([date, data]) => {
        outputHTML += `
            <div style="margin-bottom: 20px;">
                <h3>Date: ${date} (${new Date(date).toLocaleDateString('en-US', { weekday: 'long' })})</h3>
                <p><strong>Total Debit: $${data.totalDebit.toFixed(2)}</strong></p>
                <table>
                    <tr>`;
        
        // Add headers
        headers.forEach(header => {
            outputHTML += `<th>${formatHeader(header.trim())}</th>`;
        });
        outputHTML += '</tr>';

        // Add transactions for this date
        data.transactions.forEach(cells => {
            outputHTML += '<tr>';
            cells.forEach((cell, cellIndex) => {
                if (cellIndex === timeIndex) {
                    const isPM = cell.includes('PM');
                    outputHTML += `<td class="${isPM ? 'pm-time' : 'am-time'}">${cell.trim()}</td>`;
                } else {
                    outputHTML += `<td>${cell.trim()}</td>`;
                }
            });
            outputHTML += '</tr>';
        });

        outputHTML += '</table></div>';
    });

    document.getElementById('tableOutput').innerHTML = outputHTML;
}

function formatHeader(header) {
    return header.toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function reorderColumns(headers) {
    const preferredOrder = [
        'TRANSACTION DATE',
        'TRANSACTION TIME',
        'DEBIT(-)',
        'POSTED DATE',
        'ENTRY PLAZA',
        'EXIT PLAZA',
    ];

    const removedColumns = [
        'BALANCE',
        'CREDIT(+)',
        'ENTRY LANE',
        'EXIT LANE'
    ];
    
    // Create new arrays for the reordered items
    let newHeaders = [];
    let newIndices = [];
    
    // First add the preferred columns in order
    preferredOrder.forEach(preferred => {
        const index = headers.findIndex(h => h.trim() === preferred);
        if (index !== -1) {
            newHeaders.push(headers[index]);
            newIndices.push(index);
        }
    });
    
    // Add remaining columns, except those in removedColumns
    headers.forEach((header, index) => {
        const trimmedHeader = header.trim();
        if (!preferredOrder.includes(trimmedHeader) && !removedColumns.includes(trimmedHeader)) {
            newHeaders.push(header);
            newIndices.push(index);
        }
    });
    
    return {
        headers: newHeaders,
        reorderMap: newIndices,
        dateIndex: newHeaders.findIndex(h => h.trim().includes('TRANSACTION DATE')),
        debitIndex: newHeaders.findIndex(h => h.trim() === 'DEBIT(-)')
    };
}


function convertTo24Hour(timeStr) {
    const [time, period] = timeStr.split(' ');
    let [hours, minutes, seconds] = time.split(':');
    hours = parseInt(hours);
    
    // Convert to 24 hour format
    if (period === 'PM' && hours !== 12) {
        hours += 12;
    } else if (period === 'AM' && hours === 12) {
        hours = 0;
    }
    
    // Pad with leading zeros for proper string comparison
    return `${hours.toString().padStart(2, '0')}:${minutes}:${seconds}`;
}