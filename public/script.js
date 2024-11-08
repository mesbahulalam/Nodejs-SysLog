
window.jsPDF = window.jspdf.jsPDF;
let currentPage = 1;
let itemsPerPage = 25;
let sortField = 'time';
let sortDirection = 'desc';
let allLogs = [];
let filteredLogs = [];

function showLoading() {
    document.getElementById('loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.add('hidden');
}

function resetServerSearch() {
    document.getElementById('serverSearch').value = '';
    document.getElementById('routerSelect').selectedIndex = 0;
    document.getElementById('search').value = '';
    allLogs = [];
    filteredLogs = [];
    currentPage = 1;
    renderTable();
}

async function loadRouters() {
    try {
        showLoading();
        const response = await fetch('http://localhost:3000/routers');
        const routers = await response.json();
        
        const select = document.getElementById('routerSelect');
        select.innerHTML = '<option value="">Select a router</option>' + 
            routers.map(router => `<option value="${router.ip}">${router.name}</option>`).join('');
        
        select.addEventListener('change', loadRouterLogs);
    } catch (error) {
        console.error('Error loading routers:', error);
    } finally {
        hideLoading();
    }
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    if (current) {
        result.push(current.trim());
    }
    
    return result;
}

function convertToCSV(data) {
    const headers = ['Time', 'Router IP', 'User ID', 'Protocol', 'MAC', 'Local IP', 'Port', 'Remote IP', 'Port', 'NAT IP', 'Port'];
    const rows = data.map(item => [
        new Date(item.time).toLocaleString(),
        item.user_id,
        item.router_ip,
        item.protocol,
        item.mac,
        item.local_ip,
        item.local_port,
        item.remote_ip,
        item.remote_port,
        item.nat_ip,
        item.nat_port
    ]);
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => {
            const escaped = String(cell).replace(/"/g, '""');
            return cell.includes(',') ? `"${escaped}"` : escaped;
        }).join(','))
    ].join('\n');
    
    return csvContent;
}

function downloadCSV(data, filename) {
    const csvContent = convertToCSV(data);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (navigator.msSaveBlob) {
        navigator.msSaveBlob(blob, filename);
    } else {
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

function downloadExcel(data, filename) {
    const headers = ['Time', 'Router IP', 'User ID', 'Protocol', 'MAC', 'Local IP', 'Port', 'Remote IP', 'Port', 'NAT IP', 'NAT Port'];
    const rows = data.map(item => [
        new Date(item.time).toLocaleString(),
        item.user_id,
        item.router_ip,
        item.protocol,
        item.mac,
        item.local_ip,
        item.local_port,
        item.remote_ip,
        item.remote_port,
        item.nat_ip,
        item.nat_port
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Syslog Data");
    XLSX.writeFile(wb, filename);
}

function downloadPDF(data, filename) {
    const doc = new jsPDF();
    const headers = [['Time', 'Router IP', 'User ID', 'Protocol', 'MAC', 'Local IP', 'Port', 'Remote IP', 'Port', 'NAT IP', 'NAT Port']];
    const rows = data.map(item => [
        new Date(item.time).toLocaleString(),
        item.user_id,
        item.router_ip,
        item.protocol,
        item.mac,
        item.local_ip,
        item.local_port,
        item.remote_ip,
        item.remote_port,
        item.nat_ip,
        item.nat_port
    ]);

    doc.autoTable({
        head: headers,
        body: rows,
        margin: { top: 20 },
        styles: { overflow: 'linebreak' },
        columnStyles: {
            0: { cellWidth: 40 },
            1: { cellWidth: 20 },
            2: { cellWidth: 20 },
            3: { cellWidth: 20 },
            4: { cellWidth: 25 },
            5: { cellWidth: 20 },
            6: { cellWidth: 15 },
            7: { cellWidth: 20 },
            8: { cellWidth: 15 },
            9: { cellWidth: 20 },
            10: { cellWidth: 15 }
        }
    });

    doc.save(filename);
}

async function loadRouterLogs() {
    const routerId = document.getElementById('routerSelect').value;
    if (!routerId) return;

    try {
        showLoading();
        const response = await fetch(`http://localhost:3000/router/${routerId}`);
        const logs = await response.json();
        
        allLogs = logs.map(log => {
            const parts = parseCSVLine(log.content);
            return {
                time: parts[0],
                router_ip: parts[1],
                user_id: parts[2],
                protocol: parts[3],
                mac: parts[4],
                local_ip: parts[5],
                local_port: parts[6],
                remote_ip: parts[7],
                remote_port: parts[8],
                nat_ip: parts[9],
                nat_port: parts[10]
            };
        });

        filteredLogs = [...allLogs];
        currentPage = 1;
        renderTable();
    } catch (error) {
        console.error('Error loading logs:', error);
    } finally {
        hideLoading();
    }
}

async function performServerSearch() {
    const routerId = document.getElementById('routerSelect').value;
    const searchTerm = document.getElementById('serverSearch').value;
    
    if (!searchTerm) {
        alert('Please enter a search term');
        return;
    }

    const url = (!routerId) ? `http://localhost:3000/search?query=${searchTerm}` : `http://localhost:3000/router/${routerId}/search?query=${encodeURIComponent(searchTerm)}`;
    
    try {
        showLoading();
        const response = await fetch(url);
        const logs = await response.json();
        
        allLogs = logs.map(log => {
            const parts = parseCSVLine(log.content);
            return {
                time: parts[0],
                router_ip: parts[1],
                user_id: parts[2],
                protocol: parts[3],
                mac: parts[4],
                local_ip: parts[5],
                local_port: parts[6],
                remote_ip: parts[7],
                remote_port: parts[8],
                nat_ip: parts[9],
                nat_port: parts[10]
            };
        });

        filteredLogs = [...allLogs];
        currentPage = 1;
        renderTable();
    } catch (error) {
        console.error('Error performing server search:', error);
    } finally {
        hideLoading();
    }
}

function renderTable() {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const sortedData = filteredLogs.sort((a, b) => {
        if (sortDirection === 'asc') {
            return a[sortField] > b[sortField] ? 1 : -1;
        }
        return a[sortField] < b[sortField] ? 1 : -1;
    });
    
    const pageData = sortedData.slice(startIndex, endIndex);
    
    document.getElementById('tableBody').innerHTML = pageData.map(item => `
        <tr class="hover:bg-gray-50">
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${new Date(item.time).toLocaleString()}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.router_ip}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.user_id}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.protocol}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.mac}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.local_ip}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.local_port}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.remote_ip}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.remote_port}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.nat_ip}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.nat_port}</td>
        </tr>
    `).join('');

    updatePagination();
    updateRangeInfo();
}

function createPageButton(page, isActive = false) {
    return `<button class="px-4 py-2 ${isActive ? 'bg-blue-500 text-white' : 'border hover:bg-gray-50'} rounded-md" 
            onclick="goToPage(${page})">${page}</button>`;
}

function createEllipsis() {
    return '<span class="px-4 py-2">...</span>';
}

function updatePagination() {
    const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
    const paginationElement = document.getElementById('pagination');
    let paginationHTML = '';
    
    if (totalPages <= 5) {
        for (let i = 1; i <= totalPages; i++) {
            paginationHTML += createPageButton(i, i === currentPage);
        }
    } else {
        paginationHTML += createPageButton(1, currentPage === 1);
        
        if (currentPage > 3) {
            paginationHTML += createEllipsis();
        }
        
        let start = Math.max(2, currentPage - 1);
        let end = Math.min(totalPages - 1, currentPage + 1);
        
        if (currentPage <= 3) {
            end = 4;
        }
        if (currentPage >= totalPages - 2) {
            start = totalPages - 3;
        }
        
        for (let i = start; i <= end; i++) {
            paginationHTML += createPageButton(i, i === currentPage);
        }
        
        if (currentPage < totalPages - 2) {
            paginationHTML += createEllipsis();
        }
        
        paginationHTML += createPageButton(totalPages, currentPage === totalPages);
    }
    
    paginationElement.innerHTML = paginationHTML;
    
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage === totalPages;
    
    if (currentPage === 1) {
        document.getElementById('prevPage').classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        document.getElementById('prevPage').classList.remove('opacity-50', 'cursor-not-allowed');
    }
    
    if (currentPage === totalPages) {
        document.getElementById('nextPage').classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        document.getElementById('nextPage').classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

function updateRangeInfo() {
    const startIndex = (currentPage - 1) * itemsPerPage + 1;
    const endIndex = Math.min(currentPage * itemsPerPage, filteredLogs.length);
    const totalItems = filteredLogs.length;
    
    document.getElementById('startRange').textContent = startIndex;
    document.getElementById('endRange').textContent = endIndex;
    document.getElementById('totalItems').textContent = totalItems;
}

function goToPage(page) {
    currentPage = page;
    renderTable();
}

// Event Listeners
document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        renderTable();
    }
});

document.getElementById('nextPage').addEventListener('click', () => {
    const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        renderTable();
    }
});

document.getElementById('perPage').addEventListener('change', (e) => {
    itemsPerPage = parseInt(e.target.value);
    currentPage = 1;
    renderTable();
});

document.getElementById('search').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    filteredLogs = allLogs.filter(item => 
        Object.values(item).some(value => 
            value.toString().toLowerCase().includes(searchTerm)
        )
    );
    currentPage = 1;
    renderTable();
});

document.getElementById('serverSearchBtn').addEventListener('click', performServerSearch);
document.getElementById('serverSearchResetBtn').addEventListener('click', resetServerSearch);

// Add dropdown functionality
document.getElementById('exportAllBtn').addEventListener('click', function() {
    document.getElementById('exportAllDropdown').classList.toggle('show');
    document.getElementById('exportFilteredDropdown').classList.remove('show');
});

document.getElementById('exportFilteredBtn').addEventListener('click', function() {
    document.getElementById('exportFilteredDropdown').classList.toggle('show');
    document.getElementById('exportAllDropdown').classList.remove('show');
});

// Close dropdowns when clicking outside
window.addEventListener('click', function(event) {
    if (!event.target.matches('#exportAllBtn') && !event.target.matches('#exportFilteredBtn')) {
        var dropdowns = document.getElementsByClassName('dropdown-content');
        for (var i = 0; i < dropdowns.length; i++) {
            var openDropdown = dropdowns[i];
            if (openDropdown.classList.contains('show')) {
                openDropdown.classList.remove('show');
            }
        }
    }
});

// Export event listeners
document.getElementById('exportAll').addEventListener('click', () => {
    if (allLogs.length === 0) {
        alert('Please select a router first');
        return;
    }
    const routerId = document.getElementById('routerSelect').value;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadCSV(allLogs, `syslog-${routerId}-all-${timestamp}.csv`);
});

document.getElementById('exportFiltered').addEventListener('click', () => {
    if (filteredLogs.length === 0) {
        alert('No data to export');
        return;
    }
    const routerId = document.getElementById('routerSelect').value;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadCSV(filteredLogs, `syslog-${routerId}-filtered-${timestamp}.csv`);
});

document.getElementById('exportAllExcel').addEventListener('click', () => {
    if (allLogs.length === 0) {
        alert('Please select a router first');
        return;
    }
    const routerId = document.getElementById('routerSelect').value;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadExcel(allLogs, `syslog-${routerId}-all-${timestamp}.xlsx`);
});

document.getElementById('exportFilteredExcel').addEventListener('click', () => {
    if (filteredLogs.length === 0) {
        alert('No data to export');
        return;
    }
    const routerId = document.getElementById('routerSelect').value;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadExcel(filteredLogs, `syslog-${routerId}-filtered-${timestamp}.xlsx`);
});

document.getElementById('exportAllPDF').addEventListener('click', () => {
    if (allLogs.length === 0) {
        alert('Please select a router first');
        return;
    }
    const routerId = document.getElementById('routerSelect').value;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadPDF(allLogs, `syslog-${routerId}-all-${timestamp}.pdf`);
});

document.getElementById('exportFilteredPDF').addEventListener('click', () => {
    if (filteredLogs.length === 0) {
        alert('No data to export');
        return;
    }
    const routerId = document.getElementById('routerSelect').value;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadPDF(filteredLogs, `syslog-${routerId}-filtered-${timestamp}.pdf`);
});

document.querySelectorAll('.sort-header').forEach(header => {
    header.addEventListener('click', () => {
        const field = header.dataset.field;
        if (sortField === field) {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            sortField = field;
            sortDirection = 'asc';
        }
        renderTable();
    });
});

// Initialize
document.addEventListener('DOMContentLoaded', loadRouters);