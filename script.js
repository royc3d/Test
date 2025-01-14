
// Elementi
const expenseForm = document.getElementById('expense-form');
const expensesTable = document.getElementById('expenses-table').querySelector('tbody');
const exportDataBtn = document.getElementById('export-data');
const importFileInput = document.getElementById('import-file');
const importDataBtn = document.getElementById('import-data');
const generateReportBtn = document.getElementById('generate-report');
const reportOutput = document.getElementById('report-output');
const spendingChart = document.getElementById('spending-chart');

let expenses = JSON.parse(localStorage.getItem('expenses')) || [];

// Posodobitev lokalnega shranjevanja
function updateLocalStorage() {
    localStorage.setItem('expenses', JSON.stringify(expenses));
}

// Posodobitev tabele
function updateTable() {
    expensesTable.innerHTML = '';
    expenses.forEach((expense, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${expense.description}</td>
            <td>${expense.amount.toFixed(2)} €</td>
            <td>${expense.date}</td>
            <td><button onclick="deleteExpense(${index})">Izbriši</button></td>
        `;
        expensesTable.appendChild(row);
    });
    updateChart();
}

// Dodaj strošek
expenseForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const description = document.getElementById('description').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const date = document.getElementById('date').value;

    expenses.push({ description, amount, date });
    updateLocalStorage();
    updateTable();
    expenseForm.reset();
});

// Izbriši strošek
function deleteExpense(index) {
    expenses.splice(index, 1);
    updateLocalStorage();
    updateTable();
}

// Izvoz podatkov
exportDataBtn.addEventListener('click', () => {
    const dataStr = JSON.stringify(expenses, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'podatki.json';
    a.click();
});

// Uvoz podatkov
importDataBtn.addEventListener('click', () => {
    const file = importFileInput.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = () => {
            expenses = JSON.parse(reader.result);
            updateLocalStorage();
            updateTable();
        };
        reader.readAsText(file);
    }
});

// Graf porabe
function updateChart() {
    const ctx = spendingChart.getContext('2d');
    const labels = expenses.map(expense => expense.description);
    const data = expenses.map(expense => expense.amount);

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Stroški (€)',
                data,
                backgroundColor: 'rgba(98, 0, 234, 0.6)'
            }]
        },
        options: {
            responsive: true
        }
    });
}

// Inicializacija
updateTable();
