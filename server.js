const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const db = new sqlite3.Database('./database.sqlite');

// Создание таблиц
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      password TEXT,
      displayName TEXT,
      avatar TEXT,
      links TEXT,
      friends TEXT,
      incomingRequests TEXT,
      outgoingRequests TEXT,
      vip INTEGER,
      isBanned INTEGER,
      isMuted INTEGER,
      canConsole INTEGER,
      createdAt TEXT,
      lastLogin TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      type TEXT,
      content TEXT,
      senderId TEXT,
      timestamp TEXT,
      isGlobal INTEGER,
      privateWith TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS logs (
      timestamp TEXT,
      action TEXT,
      username TEXT,
      details TEXT
    )
  `);
});

// Миграция: убеждаемся, что yarik228 имеет доступ к консоли
db.get('SELECT * FROM users WHERE username = ?', ['yarik228'], (err, user) => {
  if (err) console.error(err);
  if (user) {
    if (!user.canConsole) {
      db.run('UPDATE users SET canConsole = 1 WHERE id = ?', [user.id]);
      console.log('✓ yarik228 обновлён: canConsole = 1');
    } else {
      console.log('✓ yarik228 уже имеет canConsole =', user.canConsole);
    }
  } else {
    const id = 'u' + Date.now() + Math.random();
    const now = new Date().toISOString();
    db.run(`INSERT INTO users (id, username, password, displayName, avatar, links, friends, incomingRequests, outgoingRequests, vip, isBanned, isMuted, canConsole, createdAt, lastLogin)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, 'yarik228', 'admin', 'yarik228', '', '', '[]', '[]', '[]', 1, 0, 0, 1, now, now],
      (err) => {
        if (err) console.error(err);
        else console.log('✓ yarik228 создан с canConsole = 1');
      });
  }
});

// API маршруты
app.get('/api/users', (req, res) => {
  db.all('SELECT id, username, displayName, avatar, links, vip, isBanned FROM users', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Неверные данные' });
    if (user.isBanned) return res.status(403).json({ error: 'Вы забанены' });
    db.run('UPDATE users SET lastLogin = ? WHERE id = ?', [new Date().toISOString(), user.id]);
    res.json(user);
  });
});

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT id FROM users WHERE username = ?', [username], (err, existing) => {
    if (err) return res.status(500).json({ error: err.message });
    if (existing) return res.status(400).json({ error: 'Имя уже занято' });
    const id = 'u' + Date.now() + Math.random();
    const now = new Date().toISOString();
    db.run(`INSERT INTO users (id, username, password, displayName, avatar, links, friends, incomingRequests, outgoingRequests, vip, isBanned, isMuted, canConsole, createdAt, lastLogin)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, username, password, username, '', '', '[]', '[]', '[]', 0, 0, 0, 0, now, now],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json(user);
        });
      });
  });
});

app.get('/api/messages', (req, res) => {
  db.all('SELECT * FROM messages WHERE isGlobal = 1 ORDER BY timestamp', (err, globalRows) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all('SELECT * FROM messages WHERE isGlobal = 0 ORDER BY timestamp', (err, privateRows) => {
      if (err) return res.status(500).json({ error: err.message });
      const private = {};
      for (const msg of privateRows) {
        if (!private[msg.privateWith]) private[msg.privateWith] = [];
        private[msg.privateWith].push(msg);
      }
      res.json({ global: globalRows, private });
    });
  });
});

app.post('/api/messages', (req, res) => {
  const { type, content, senderId, timestamp, isGlobal, privateWith } = req.body;
  const id = 'msg' + Date.now() + Math.random();
  db.run(`INSERT INTO messages (id, type, content, senderId, timestamp, isGlobal, privateWith)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, type, content, senderId, timestamp, isGlobal ? 1 : 0, privateWith || ''],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ status: 'ok' });
    });
});

app.post('/api/update_user', (req, res) => {
  const user = req.body.user;
  db.run(`UPDATE users SET displayName = ?, avatar = ?, links = ?, friends = ?, incomingRequests = ?, outgoingRequests = ?, vip = ?, isBanned = ?, isMuted = ?, canConsole = ?, password = ? WHERE id = ?`,
    [
      user.displayName,
      user.avatar,
      user.links,
      JSON.stringify(user.friends),
      JSON.stringify(user.incomingRequests),
      JSON.stringify(user.outgoingRequests),
      user.vip ? 1 : 0,
      user.isBanned ? 1 : 0,
      user.isMuted ? 1 : 0,
      user.canConsole ? 1 : 0,
      user.password,
      user.id
    ],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ status: 'ok' });
    });
});

app.get('/api/logs', (req, res) => {
  db.all('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 200', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/logs', (req, res) => {
  const { action, username, details } = req.body;
  db.run('INSERT INTO logs (timestamp, action, username, details) VALUES (?, ?, ?, ?)',
    [new Date().toISOString(), action, username, details],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ status: 'ok' });
    });
});

// Для проверки, что сервер работает
app.get('/', (req, res) => {
  res.send('YaSsenger API работает');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
