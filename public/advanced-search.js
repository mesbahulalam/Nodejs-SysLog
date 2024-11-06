// Global variables
let searchResults = [];

function showLoading() {
    document.getElementById('loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.add('hidden');
}

async function loadRouters() {
    try {
        showLoading();
        const response = await fetch('http://localhost:3000/routers');
        const routers = await response.json();
        
        const select = document.getElementById('routerSelect');
        select.innerHTML = '<option value="">All Routers</option>' + 
            routers.map(router => `<option value="${router.ip}">${router.name}</option>`).join('');
    } catch (error) {
        console.error('Error loading routers:', error);
    } finally {
        hideLoading();
    }
}

function resetForm() {
    document.getElementById('advancedSearchForm').reset();
    document.getElementById('resultsTableBody').innerHTML = '';
    searchResults = [];
}

function renderResults(results) {
    const tbody = document.getElementById('resultsTableBody');
    tbody.innerHTML = results.map(item => `
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
}

async function performAdvancedSearch(event) {
    event.preventDefault();

    const searchParams = {
        routerId: document.getElementById('routerSelect').value,
        user_id: document.getElementById('userId').value,
        protocol: document.getElementById('protocol').value,
        mac: document.getElementById('mac').value,
        local_ip: document.getElementById('localIp').value,
        local_port: document.getElementById('localPort').value,
        remote_ip: document.getElementById('remoteIp').value,
        remote_port: document.getElementById('remotePort').value,
        nat_ip: document.getElementById('natIp').value,
        nat_port: document.getElementById('natPort').value
    };

    // Add time range if both start and end are provided
    const timeStart = document.getElementById('timeStart').value;
    const timeEnd = document.getElementById('timeEnd').value;
    if (timeStart && timeEnd) {
        searchParams.timeRange = `${timeStart},${timeEnd}`;
    }

    try {
        showLoading();
        const response = await fetch('http://localhost:3000/advanced-search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(searchParams)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to perform search');
        }

        searchResults = await response.json();
        renderResults(searchResults);
    } catch (error) {
        console.error('Error performing advanced search:', error);
        alert('Error performing search: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    loadRouters();
    document.getElementById('advancedSearchForm').addEventListener('submit', performAdvancedSearch);
    document.getElementById('resetBtn').addEventListener('click', resetForm);
});

// Add link to advanced search in the main index.html page
if (window.opener) {
    const advancedSearchLink = document.createElement('a');
    advancedSearchLink.href = '/advanced-search.html';
    advancedSearchLink.className = 'text-blue-600 hover:text-blue-800';
    advancedSearchLink.textContent = 'Advanced Search';
    document.querySelector('#toggleAdvanced').replaceWith(advancedSearchLink);
}
