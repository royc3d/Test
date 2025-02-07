// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { google } = require('googleapis');
const ExcelJS = require('exceljs');
const bodyParser = require('body-parser');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const path = require('path');
const streamifier = require('streamifier');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

app.use(
  session({
    secret: 'nekaj-zelo-skrivnega',
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => { 
  done(null, user); 
});
passport.deserializeUser((obj, done) => { 
  done(null, obj); 
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/auth/google/callback',
      scope: ['profile', 'email', 'https://www.googleapis.com/auth/drive.file'],
      prompt: 'consent',
      accessType: 'offline'
    },
    (accessToken, refreshToken, profile, done) => {
      profile.accessToken = accessToken;
      profile.refreshToken = refreshToken;
      return done(null, profile);
    }
  )
);

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

// Globalna spremenljivka za shranjevanje vseh transakcij (ročno vnešenih, uvoženih iz Excel in ročno vnese)
let transactions = [];

// Definirane kategorije
const categories = [
  'Hrana', 'Sushi', 'Najemnina', 'Stroški', 'Internet', 'Mobitel', 'Zavarovanje',
  'Gorivo', 'Avtomobil', 'Zdravje', 'Skupni račun', 'Potovanje', 'Plača',
  'Investicije', 'Investicije - Bitcoin', 'Nedoločeno', 'Trava', 'Malica v službi',
  'Drones', 'Tech', 'Tobak', 'Alkohol', 'Za klapu', 'Življenjska',
  'Varčevalni račun', 'Darila', 'Mnčis', 'H & Hrana za psa', 'Osebna nega',
  'Oblačila', 'Kava', 'Kapice', 'Za stanovanje', 'Banka', 'Gorivo (štirikolesnik)',
  'Stroški (štirikolesnik)', 'Padalstvo'
];

/* Funkcija za pretvorbo slovenskega formata datuma "DD.MM.YYYY" v Date objekt */
function parseSlovenianDate(dateStr) {
  const parts = dateStr.split('.');
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    return new Date(`${year}-${month}-${day}`);
  }
  return new Date(dateStr);
}

// Glavna stran – Vnos transakcij
app.get('/', (req, res) => {
  res.render('index', { user: req.user, categories });
});

// Google auth poti
app.get(
  '/auth/google',
  passport.authenticate('google', {
    scope: ['profile', 'email', 'https://www.googleapis.com/auth/drive.file'],
    prompt: 'consent',
    accessType: 'offline'
  })
);
app.get(
  '/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => { res.redirect('/'); }
);

app.get('/login', (req, res) => {
  res.render('login', { user: req.user });
});

app.get('/logout', (req, res, next) => {
  req.logout(function(err) {
    if (err) return next(err);
    res.redirect('/');
  });
});

// POST – Vnos nove transakcije (ročno vnešene)
app.post('/transaction', async (req, res) => {
  const { date, type, amount, category } = req.body;
  const transaction = {
    id: Date.now(),
    date: new Date(date),
    type,
    amount: Number(amount) || 0,
    category,
  };
  transactions.push(transaction);
  
  // Opcijsko: nalaganje Excel datoteke na Google Drive
  if (req.user && req.user.accessToken) {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Transakcije');
      worksheet.columns = [
        { header: 'Datum', key: 'date', width: 15 },
        { header: 'Tip', key: 'type', width: 15 },
        { header: 'Znesek', key: 'amount', width: 15 },
        { header: 'Kategorija', key: 'category', width: 20 },
      ];
      transactions.forEach(t => worksheet.addRow(t));
      const buffer = await workbook.xlsx.writeBuffer();
      const fileData = await uploadExcelToDrive(buffer, req.user.accessToken);
      console.log('Excel datoteka je naložena na Google Drive. ID:', fileData.id);
    } catch (error) {
      console.error('Napaka pri nalaganju Excel datoteke:', error);
    }
  }
  res.redirect('/');
});

// POST – Uvoz Excel datoteke
app.post('/import', upload.single('excelFile'), async (req, res) => {
  if (!req.file) return res.status(400).send("Ni priložene Excel datoteke.");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(req.file.path);
    const worksheet = workbook.getWorksheet(1);
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > 1) { // Preskočimo glavo
        let rawDate = row.getCell(1).value;
        let dateObj;
        if (rawDate instanceof Date) {
          dateObj = rawDate;
        } else if (typeof rawDate === 'number') {
          dateObj = new Date((rawDate - 25569) * 86400 * 1000);
        } else if (typeof rawDate === 'string' && rawDate.includes('.')) {
          dateObj = parseSlovenianDate(rawDate);
        } else {
          dateObj = new Date(rawDate);
        }
        const transaction = {
          id: Date.now() + rowNumber,
          date: new Date(dateObj),
          type: row.getCell(2).value,
          amount: Number(row.getCell(3).value) || 0,
          category: row.getCell(4).value,
        };
        transactions.push(transaction);
      }
    });
    res.send("Excel datoteka uspešno uvožena.");
  } catch (error) {
    console.error("Napaka pri uvozu datoteke:", error);
    res.status(500).send("Napaka pri uvozu datoteke.");
  }
});

// GET – Ročni vnos transakcij (obrazec)
app.get('/manual-import', (req, res) => {
  res.render('manual-import', { user: req.user });
});

// POST – Ročni vnos transakcij
app.post('/manual-import', (req, res) => {
  const manualData = req.body.manualData;
  if (!manualData) return res.status(400).send("Ni vnešenih podatkov.");
  
  // Vsaka vrstica: "DD.MM.YYYY, tip, znesek, kategorija"
  const lines = manualData.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    const parts = line.split(',');
    if (parts.length < 4) {
      console.log("Nepravilen format vrstice:", line);
      return;
    }
    const datum = parts[0].trim();
    const tip = parts[1].trim();
    const znesek = Number(parts[2].trim()) || 0;
    const kategorija = parts[3].trim();
    const dateObj = datum.includes('.') ? parseSlovenianDate(datum) : new Date(datum);
    const transaction = {
      id: Date.now() + index,
      date: new Date(dateObj),
      type: tip,
      amount: znesek,
      category: kategorija,
    };
    console.log("Ročno dodajam transakcijo:", transaction);
    transactions.push(transaction);
  });
  res.redirect('/monthly');
});

// POST – Izbriši vse transakcije
app.post('/delete-all', (req, res) => {
  transactions = [];
  res.redirect('/transactions');
});

// Funkcija: nalaganje Excel datoteke na Google Drive
async function uploadExcelToDrive(buffer, accessToken) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const fileStream = streamifier.createReadStream(buffer);
  const fileMetadata = {
    name: 'Transakcije.xlsx',
    parents: ['root'],
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  const media = { mimeType: fileMetadata.mimeType, body: fileStream };
  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id',
  });
  return response.data;
}

// ==================================================================
// Stran "Mesečni pregled"
// ==================================================================
app.get('/monthly', (req, res) => {
  let month = parseInt(req.query.month);
  let year = parseInt(req.query.year);
  const now = new Date();
  if (isNaN(month) || isNaN(year)) {
    month = now.getMonth();
    year = now.getFullYear();
  }
  // Filtriramo transakcije za izbran mesec in leto
  const monthlyTransactions = transactions.filter(t => {
    const tDate = new Date(t.date);
    return tDate.getMonth() === month && tDate.getFullYear() === year;
  });
  // Seštevki
  const incomeSum = monthlyTransactions
    .filter(t => t.type === 'prihodek')
    .reduce((sum, t) => sum + t.amount, 0);
  const expenseSum = monthlyTransactions
    .filter(t => t.type === 'odhodek')
    .reduce((sum, t) => sum + t.amount, 0);
  const investmentSum = monthlyTransactions
    .filter(t => t.type === 'investicija')
    .reduce((sum, t) => sum + t.amount, 0);
  // Grupiranje odhodkov po kategorijah
  const expensesByCategory = {};
  monthlyTransactions.filter(t => t.type === 'odhodek').forEach(t => {
    expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + t.amount;
  });
  let groupedExpenses = Object.keys(expensesByCategory).map(cat => ({
    category: cat, total: expensesByCategory[cat]
  }));
  groupedExpenses.sort((a, b) => b.total - a.total);
  // Zadnjih 10 transakcij (najnovejše najprej)
  let sortedMonthlyTransactions = monthlyTransactions.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const last10Transactions = sortedMonthlyTransactions.slice(0, 10);
  const monthNames = ["Januar", "Februar", "Marec", "April", "Maj", "Junij", "Julij", "Avgust", "September", "Oktober", "November", "December"];
  const selectedMonthName = monthNames[month];
  res.render('monthly', { 
    transactions: monthlyTransactions, 
    user: req.user, 
    selectedMonth: month, 
    selectedYear: year,
    selectedMonthName: selectedMonthName,
    incomeSum: incomeSum,
    expenseSum: expenseSum,
    investmentSum: investmentSum,
    groupedExpenses: groupedExpenses,
    last10Transactions: last10Transactions,
    allMonthlyTransactions: sortedMonthlyTransactions
  });
});

// ==================================================================
// Stran "Letno poročilo"
// ==================================================================
app.get('/annual', (req, res) => {
  let year = parseInt(req.query.year);
  const now = new Date();
  if (isNaN(year)) {
    year = now.getFullYear();
  }
  // Filtriramo transakcije za izbrano leto
  const annualTransactions = transactions.filter(t => {
    return new Date(t.date).getFullYear() === year;
  });
  // Seštevki
  const incomeSum = annualTransactions
    .filter(t => t.type === 'prihodek')
    .reduce((sum, t) => sum + t.amount, 0);
  const expenseSum = annualTransactions
    .filter(t => t.type === 'odhodek')
    .reduce((sum, t) => sum + t.amount, 0);
  const investmentSum = annualTransactions
    .filter(t => t.type === 'investicija')
    .reduce((sum, t) => sum + t.amount, 0);
  // Grupiranje odhodkov
  const expensesByCategory = {};
  annualTransactions.filter(t => t.type === 'odhodek').forEach(t => {
    expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + t.amount;
  });
  let groupedExpenses = Object.keys(expensesByCategory).map(cat => ({
    category: cat, total: expensesByCategory[cat]
  }));
  groupedExpenses.sort((a, b) => b.total - a.total);
  // Grupiranje prihodkov
  const incomesByCategory = {};
  annualTransactions.filter(t => t.type === 'prihodek').forEach(t => {
    incomesByCategory[t.category] = (incomesByCategory[t.category] || 0) + t.amount;
  });
  let groupedIncomes = Object.keys(incomesByCategory).map(cat => ({
    category: cat, total: incomesByCategory[cat]
  }));
  groupedIncomes.sort((a, b) => b.total - a.total);
  res.render('annual', { 
    transactions: annualTransactions, 
    user: req.user, 
    selectedYear: year,
    incomeSum: incomeSum,
    expenseSum: expenseSum,
    investmentSum: investmentSum,
    groupedExpenses: groupedExpenses,
    groupedIncomes: groupedIncomes
  });
});

// ==================================================================
// Stran "Vse transakcije"
// ==================================================================
app.get('/transactions', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const perPage = 10;
  const start = (page - 1) * perPage;
  const paginatedTransactions = transactions.slice().reverse().slice(start, start + perPage);
  res.render('transactions', { transactions: paginatedTransactions, page, user: req.user });
});

app.get('/settings', (req, res) => {
  res.render('settings', { user: req.user, categories });
});

app.listen(PORT, () => {
  console.log(`Strežnik teče na http://localhost:${PORT}`);
});
