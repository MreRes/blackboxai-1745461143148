// Check authentication
const token = localStorage.getItem('token');
if (!token) {
    window.location.href = '/index.html';
}

// Global variables
let currentPage = 1;
let totalPages = 1;
let currentFilters = {
    startDate: null,
    endDate: null,
    type: '',
    category: '',
    source: ''
};
let deleteTransactionId = null;

// Format currency
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR'
    }).format(amount);
};

// Format date
const formatDate = (date) => {
    return new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(new Date(date));
};

// Initialize date range picker
$(document).ready(function() {
    $('#dateRange').daterangepicker({
        startDate: moment().startOf('month'),
        endDate: moment().endOf('month'),
        ranges: {
            'Hari Ini': [moment(), moment()],
            'Kemarin': [moment().subtract(1, 'days'), moment().subtract(1, 'days')],
            'Minggu Ini': [moment().startOf('week'), moment().endOf('week')],
            'Bulan Ini': [moment().startOf('month'), moment().endOf('month')],
            'Bulan Lalu': [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')]
        },
        locale: {
            format: 'DD/MM/YYYY'
        }
    }, function(start, end) {
        currentFilters.startDate = start.format('YYYY-MM-DD');
        currentFilters.endDate = end.format('YYYY-MM-DD');
        fetchTransactions();
    });
});

// Set user greeting
const user = JSON.parse(localStorage.getItem('user'));
document.getElementById('userGreeting').textContent = `Selamat datang, ${user.username}`;

// Fetch categories for dropdowns
async function fetchCategories() {
    try {
        const response = await fetch('/api/transactions/categories', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to fetch categories');

        const categories = await response.json();
        const categorySelect = document.getElementById('category');
        const categoryFilter = document.getElementById('categoryFilter');

        categories.forEach(category => {
            categorySelect.add(new Option(category, category));
            categoryFilter.add(new Option(category, category));
        });
    } catch (error) {
        console.error('Error:', error);
    }
}

// Fetch transactions
async function fetchTransactions() {
    try {
        const queryParams = new URLSearchParams({
            page: currentPage,
            limit: 10,
            ...currentFilters
        });

        const response = await fetch(`/api/transactions?${queryParams}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to fetch transactions');

        const data = await response.json();
        updateTransactionsTable(data.data);
        updatePagination(data.pagination);
    } catch (error) {
        console.error('Error:', error);
    }
}

// Update transactions table
function updateTransactionsTable(transactions) {
    const tbody = document.getElementById('transactionsTable');
    tbody.innerHTML = transactions.map(t => `
        <tr>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatDate(t.date)}</td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${t.type === 'income' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                    ${t.type === 'income' ? 'Pemasukan' : 'Pengeluaran'}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${t.category}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${t.description}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}">${formatCurrency(t.amount)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${t.source}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <button onclick="editTransaction('${t._id}')" class="text-blue-600 hover:text-blue-800 mr-3">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="showDeleteModal('${t._id}')" class="text-red-600 hover:text-red-800">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// Update pagination
function updatePagination(pagination) {
    totalPages = pagination.pages;
    const paginationElement = document.getElementById('pagination');
    
    let paginationHTML = `
        <button onclick="changePage(${currentPage - 1})" class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50" ${currentPage === 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i>
        </button>
    `;

    for (let i = 1; i <= totalPages; i++) {
        paginationHTML += `
            <button onclick="changePage(${i})" class="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium ${currentPage === i ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}">
                ${i}
            </button>
        `;
    }

    paginationHTML += `
        <button onclick="changePage(${currentPage + 1})" class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50" ${currentPage === totalPages ? 'disabled' : ''}>
            <i class="fas fa-chevron-right"></i>
        </button>
    `;

    paginationElement.innerHTML = paginationHTML;
    
    // Update count text
    document.getElementById('startCount').textContent = ((currentPage - 1) * 10) + 1;
    document.getElementById('endCount').textContent = Math.min(currentPage * 10, pagination.total);
    document.getElementById('totalCount').textContent = pagination.total;
}

// Change page
function changePage(page) {
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    fetchTransactions();
}

// Transaction modal functions
function openTransactionModal(transactionId = null) {
    const modal = document.getElementById('transactionModal');
    const modalTitle = document.getElementById('modalTitle');
    const form = document.getElementById('transactionForm');
    
    modalTitle.textContent = transactionId ? 'Edit Transaksi' : 'Tambah Transaksi';
    form.reset();
    
    if (transactionId) {
        document.getElementById('transactionId').value = transactionId;
        // Fetch and populate transaction data
        fetchTransactionDetails(transactionId);
    } else {
        document.getElementById('transactionId').value = '';
        document.getElementById('date').value = new Date().toISOString().slice(0, 16);
    }
    
    modal.classList.remove('hidden');
}

function closeTransactionModal() {
    document.getElementById('transactionModal').classList.add('hidden');
}

// Delete modal functions
function showDeleteModal(transactionId) {
    deleteTransactionId = transactionId;
    document.getElementById('deleteModal').classList.remove('hidden');
}

function closeDeleteModal() {
    deleteTransactionId = null;
    document.getElementById('deleteModal').classList.add('hidden');
}

// Fetch transaction details for editing
async function fetchTransactionDetails(transactionId) {
    try {
        const response = await fetch(`/api/transactions/${transactionId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to fetch transaction details');

        const transaction = await response.json();
        
        // Populate form
        document.getElementById('type').value = transaction.type;
        document.getElementById('amount').value = transaction.amount;
        document.getElementById('category').value = transaction.category;
        document.getElementById('description').value = transaction.description;
        document.getElementById('date').value = new Date(transaction.date).toISOString().slice(0, 16);
    } catch (error) {
        console.error('Error:', error);
    }
}

// Handle form submission
document.getElementById('transactionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const transactionId = document.getElementById('transactionId').value;
    const method = transactionId ? 'PUT' : 'POST';
    const url = transactionId ? `/api/transactions/${transactionId}` : '/api/transactions';
    
    const formData = {
        type: document.getElementById('type').value,
        amount: parseFloat(document.getElementById('amount').value),
        category: document.getElementById('category').value,
        description: document.getElementById('description').value,
        date: document.getElementById('date').value,
        source: 'manual'
    };

    try {
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(formData)
        });

        if (!response.ok) throw new Error('Failed to save transaction');

        closeTransactionModal();
        fetchTransactions();
    } catch (error) {
        console.error('Error:', error);
    }
});

// Handle delete confirmation
async function confirmDelete() {
    if (!deleteTransactionId) return;

    try {
        const response = await fetch(`/api/transactions/${deleteTransactionId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to delete transaction');

        closeDeleteModal();
        fetchTransactions();
    } catch (error) {
        console.error('Error:', error);
    }
}

// Handle filter changes
document.getElementById('typeFilter').addEventListener('change', (e) => {
    currentFilters.type = e.target.value;
    currentPage = 1;
    fetchTransactions();
});

document.getElementById('categoryFilter').addEventListener('change', (e) => {
    currentFilters.category = e.target.value;
    currentPage = 1;
    fetchTransactions();
});

document.getElementById('sourceFilter').addEventListener('change', (e) => {
    currentFilters.source = e.target.value;
    currentPage = 1;
    fetchTransactions();
});

// Handle logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/index.html';
});

// Initial load
fetchCategories();
fetchTransactions();
