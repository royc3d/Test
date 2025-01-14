
const expenseForm = document.getElementById('expense-form');
const expensesTable = document.getElementById('expenses-table').querySelector('tbody');
const addCategoryBtn = document.getElementById('add-category');
const categorySelect = document.getElementById('category');
const newCategoryInput = document.getElementById('new-category');
const exportExcelBtn = document.getElementById('export-excel');
const importExcelBtn = document.getElementById('import-excel');
const importFileInput = document.getElementById('import-file');
const spendingChart = document.getElementById('spending-chart');
const themeColorInput = document.getElementById('theme-color');
const applyThemeBtn = document.getElementById('apply-theme');

let expenses = JSON.parse(localStorage.getItem('expenses')) || [];

function updateLocalStorage() {
    localStorage.setItem('expenses', JSON.stringify(expenses));
}

function updateTable() {
    expensesTable.innerHTML = '';
    expenses.forEach((expense, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${expense.description}</td>
            <td>${expense.category}</td>
            <td>${expense.amount.toFixed(2)} €</td>
            <td>${expense.date}</td>
            <td><button onclick="deleteExpense(${index})" class="btn">Izbriši</button></td>
        `;
        expensesTable.appendChild(row);
    });
    updateChart();
}

expenseForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const description = document.getElementById('description').value;
    const category = categorySelect.value;
    const amount = parseFloat(document.getElementById('amount').value);
    const date = document.getElementById('date').value;

    expenses.push({ description, category, amount, date });
    updateLocalStorage();
    updateTable();
    expenseForm.reset();
});

addCategoryBtn.addEventListener('click', () => {
    const newCategory = newCategoryInput.value.trim();
    if (newCategory && ![...categorySelect.options].some(option => option.value === newCategory)) {
        const option = document.createElement('option');
        option.value = newCategory;
        option.textContent = newCategory;
        categorySelect.appendChild(option);
        newCategoryInput.value = '';
    }
});

function deleteExpense(index) {
    expenses.splice(index, 1);
    updateLocalStorage();
    updateTable();
}

function updateChart() {
    const ctx = spendingChart.getContext('2d');
    const categories = [...new Set(expenses.map(exp => exp.category))];
    const data = categories.map(category =>
        expenses.filter(exp => exp.category === category).reduce((sum, exp) => sum + exp.amount, 0)
    );

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categories,
            datasets: [{
                label: 'Stroški (€)',
                data,
                backgroundColor: ['#6200ea', '#03dac6', '#ff0266', '#ffde03', '#018786']
            }]
        },
        options: {
            responsive: true
        }
    });
}

importExcelBtn.addEventListener('click', () => {
    const file = importFileInput.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

            expenses = sheet.map(row => ({
                description: row.Opis || '',
                category: row.Kategorija || 'Ostalo',
                amount: parseFloat(row.Znesek || 0),
                date: row.Datum || ''
            }));
            updateLocalStorage();
            updateTable();
        };
        reader.readAsArrayBuffer(file);
    }
});

exportExcelBtn.addEventListener('click', () => {
    const worksheet = XLSX.utils.json_to_sheet(expenses);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Stroški');
    XLSX.writeFile(workbook, 'stroški.xlsx');
});

applyThemeBtn.addEventListener('click', () => {
    document.documentElement.style.setProperty('--primary-color', themeColorInput.value);
});

updateTable();
