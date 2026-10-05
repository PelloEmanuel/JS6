// Servidor Express: sirve la página y expone la API del juego (palabras y puntajes).
const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const { palabras } = require('./palabras');

const app = express();
const PUERTO = 3000;
const raiz = path.join(__dirname, '..'); // carpeta principal del proyecto

// Datos de conexión a MySQL (se pueden cambiar con variables de entorno)
const configuracion = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || ''
};

let pool = null; // conexión a la base "Score" (se crea al iniciar)

// Crea la base de datos y la tabla si todavía no existen
async function iniciarBaseDeDatos() {
  const conexion = await mysql.createConnection(configuracion);
  await conexion.query('CREATE DATABASE IF NOT EXISTS Score');
  await conexion.query(`
    CREATE TABLE IF NOT EXISTS Score.score (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tiempo INT NOT NULL,
      puntos INT NOT NULL,
      fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      nombre VARCHAR(20) NOT NULL
    )
  `);
  await conexion.end();
  pool = mysql.createPool({ ...configuracion, database: 'Score' });
  console.log('Base de datos "Score" lista.');
}

// ---------- Validaciones ----------
function nombreValido(nombre) {
  return (
    typeof nombre === 'string' &&
    nombre.trim().length >= 1 &&
    nombre.trim().length <= 20 &&
    /^[\p{L}0-9 ]+$/u.test(nombre.trim())
  );
}

function enteroEnRango(valor, maximo) {
  return Number.isInteger(valor) && valor >= 0 && valor <= maximo;
}

// Envuelve cada ruta de la API para manejar errores de forma simple
function ruta(manejador) {
  return async (req, res) => {
    if (!pool) {
      return res.status(500).json({ error: 'No hay conexión con la base de datos.' });
    }
    try {
      await manejador(req, res);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error en el servidor.' });
    }
  };
}

app.use(express.json());

// ---------- Páginas y archivos estáticos (nunca se expone server.js) ----------
app.get('/', (req, res) => res.sendFile(path.join(raiz, 'pages', 'index.html')));
app.use('/styles', express.static(path.join(raiz, 'styles')));
app.use('/data', express.static(path.join(raiz, 'data')));
app.get('/modules/script.js', (req, res) => res.sendFile(path.join(raiz, 'modules', 'script.js')));

// ---------- API ----------
// Devuelve una palabra al azar para armar la partida
app.get('/api/palabra', (req, res) => {
  const elegida = palabras[Math.floor(Math.random() * palabras.length)];
  res.json(elegida);
});

// Tabla de posiciones: los 10 mejores (más puntos, y a igual puntaje, menos tiempo)
app.get('/api/scores', ruta(async (req, res) => {
  const [filas] = await pool.query(
    'SELECT id, nombre, puntos, tiempo, fecha FROM score ORDER BY puntos DESC, tiempo ASC LIMIT 10'
  );
  res.json(filas);
}));

// Guardar un puntaje nuevo
app.post('/api/scores', ruta(async (req, res) => {
  const { nombre, tiempo, puntos } = req.body;
  if (!nombreValido(nombre) || !enteroEnRango(tiempo, 86400) || !enteroEnRango(puntos, 1000)) {
    return res.status(400).json({ error: 'Datos inválidos.' });
  }
  const [resultado] = await pool.query(
    'INSERT INTO score (nombre, tiempo, puntos) VALUES (?, ?, ?)',
    [nombre.trim(), tiempo, puntos]
  );
  res.status(201).json({ id: resultado.insertId });
}));

// Editar el nombre de un puntaje
app.put('/api/scores/:id', ruta(async (req, res) => {
  const id = Number(req.params.id);
  const { nombre } = req.body;
  if (!Number.isInteger(id) || !nombreValido(nombre)) {
    return res.status(400).json({ error: 'Datos inválidos.' });
  }
  const [resultado] = await pool.query('UPDATE score SET nombre = ? WHERE id = ?', [nombre.trim(), id]);
  if (resultado.affectedRows === 0) {
    return res.status(404).json({ error: 'No se encontró el puntaje.' });
  }
  res.json({ ok: true });
}));

// Borrar un puntaje
app.delete('/api/scores/:id', ruta(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Datos inválidos.' });
  }
  const [resultado] = await pool.query('DELETE FROM score WHERE id = ?', [id]);
  if (resultado.affectedRows === 0) {
    return res.status(404).json({ error: 'No se encontró el puntaje.' });
  }
  res.json({ ok: true });
}));

// El servidor arranca igual aunque MySQL falle, y avisa por consola
app.listen(PUERTO, () => {
  console.log(`Servidor listo en http://localhost:${PUERTO}`);
  iniciarBaseDeDatos().catch((error) => {
    console.error('No se pudo conectar a MySQL:', error.message);
  });
});
