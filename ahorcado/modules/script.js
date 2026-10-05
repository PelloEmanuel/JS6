// ===== Utilidades =====
const $ = (id) => document.getElementById(id);
const LETRAS = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');

// Crea un elemento con texto y clase (usa textContent, así el texto del usuario es seguro)
function crear(etiqueta, texto, clase) {
  const elemento = document.createElement(etiqueta);
  if (texto !== undefined) elemento.textContent = texto;
  if (clase) elemento.className = clase;
  return elemento;
}

function crearBoton(texto, clase, accion) {
  const boton = crear('button', texto, 'boton boton-chico ' + clase);
  boton.type = 'button';
  boton.addEventListener('click', accion);
  return boton;
}

// Aviso que desaparece solo (tipo: 'exito' o 'error')
let temporizadorAviso = null;
function mostrarAviso(texto, tipo) {
  const toast = $('toast');
  toast.textContent = texto;
  toast.className = 'toast visible ' + tipo;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => {
    toast.className = 'toast';
  }, 3500);
}

function validarNombre(nombre) {
  if (nombre === '') return 'Escribí tu nombre.';
  if (nombre.length > 20) return 'El nombre puede tener hasta 20 caracteres.';
  if (!/^[\p{L}0-9 ]+$/u.test(nombre)) return 'Usá solo letras, números y espacios.';
  return '';
}

// ===== Clases =====

// Lógica del juego (no toca la pantalla)
class Ahorcado {
  constructor(palabra, pista) {
    this.palabra = palabra;
    this.pista = pista;
    this.letrasUsadas = [];
    this.errores = 0;
    this.maxErrores = 6;
  }

  // Devuelve true si la letra se jugó (false si ya estaba usada o terminó el juego)
  adivinar(letra) {
    if (this.terminado() || this.letrasUsadas.includes(letra)) return false;
    this.letrasUsadas.push(letra);
    if (!this.palabra.includes(letra)) this.errores++;
    return true;
  }

  palabraVisible() {
    return this.palabra.split('').map((letra) => (this.letrasUsadas.includes(letra) ? letra : '_'));
  }

  gano() {
    return this.palabra.split('').every((letra) => this.letrasUsadas.includes(letra));
  }

  perdio() {
    return this.errores >= this.maxErrores;
  }

  terminado() {
    return this.gano() || this.perdio();
  }

  // Más letras = más puntos; cada error y cada 5 segundos restan
  calcularPuntos(segundos) {
    if (!this.gano()) return 0;
    const puntos = 100 + this.palabra.length * 10 - this.errores * 15 - Math.floor(segundos / 5);
    return Math.max(puntos, 10);
  }
}

// Cuenta los segundos de la partida
class Cronometro {
  constructor(alCambiar) {
    this.segundos = 0;
    this.intervalo = null;
    this.alCambiar = alCambiar;
  }

  iniciar() {
    this.detener();
    this.segundos = 0;
    this.alCambiar(0);
    this.intervalo = setInterval(() => {
      this.segundos++;
      this.alCambiar(this.segundos);
    }, 1000);
  }

  detener() {
    clearInterval(this.intervalo);
    this.intervalo = null;
  }
}

// Todos los pedidos al servidor (fetch) en un solo lugar
class ApiScore {
  static async pedir(url, opciones) {
    let respuesta;
    try {
      respuesta = await fetch(url, opciones);
    } catch (error) {
      throw new Error('No se pudo conectar con el servidor.');
    }
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || 'Ocurrió un error inesperado.');
    return datos;
  }

  static conCuerpo(metodo, cuerpo) {
    return {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    };
  }

  static obtenerPalabra() {
    return ApiScore.pedir('/api/palabra');
  }

  static listar() {
    return ApiScore.pedir('/api/scores');
  }

  static guardar(datos) {
    return ApiScore.pedir('/api/scores', ApiScore.conCuerpo('POST', datos));
  }

  static editar(id, nombre) {
    return ApiScore.pedir('/api/scores/' + id, ApiScore.conCuerpo('PUT', { nombre }));
  }

  static borrar(id) {
    return ApiScore.pedir('/api/scores/' + id, { method: 'DELETE' });
  }
}

// ===== Estado =====
let juego = null;
let resultado = null; // datos de la partida terminada (se usa para guardar y para el PDF)
let puntajeGuardado = false;
let puntajes = [];
let editandoId = null;
let idAEliminar = null;

const cronometro = new Cronometro((segundos) => {
  $('tiempo').textContent = segundos;
});

// ===== Juego =====
function armarTeclado() {
  LETRAS.forEach((letra) => {
    const boton = crear('button', letra, 'tecla');
    boton.type = 'button';
    boton.disabled = true;
    boton.addEventListener('click', () => jugarLetra(letra));
    $('teclado').appendChild(boton);
  });
}

function dibujarJuego() {
  $('palabra').textContent = juego.palabraVisible().join(' ');
  $('pista').textContent = 'Pista: ' + juego.pista;
  $('errores').textContent = juego.errores + ' de ' + juego.maxErrores;

  document.querySelectorAll('.parte').forEach((parte, i) => {
    parte.classList.toggle('visible', i < juego.errores);
  });

  document.querySelectorAll('.tecla').forEach((boton) => {
    const letra = boton.textContent;
    const usada = juego.letrasUsadas.includes(letra);
    boton.disabled = usada || juego.terminado();
    boton.classList.toggle('acierto', usada && juego.palabra.includes(letra));
    boton.classList.toggle('fallo', usada && !juego.palabra.includes(letra));
  });
}

async function nuevaPartida() {
  cronometro.detener();
  $('btn-nueva').disabled = true;
  try {
    const datos = await ApiScore.obtenerPalabra();
    juego = new Ahorcado(datos.palabra, datos.pista);
    resultado = null;
    puntajeGuardado = false;
    $('mensaje-juego').className = 'aviso oculto';
    $('form-guardar').classList.add('oculto');
    $('error-nombre').textContent = '';
    dibujarJuego();
    cronometro.iniciar();
  } catch (error) {
    mostrarAviso(error.message, 'error');
  } finally {
    $('btn-nueva').disabled = false;
  }
}

function jugarLetra(letra) {
  if (!juego) return;
  if (juego.adivinar(letra)) {
    dibujarJuego();
    if (juego.terminado()) finalizarPartida();
  }
}

function finalizarPartida() {
  cronometro.detener();
  const puntos = juego.calcularPuntos(cronometro.segundos);
  resultado = {
    palabra: juego.palabra,
    gano: juego.gano(),
    errores: juego.errores,
    tiempo: cronometro.segundos,
    puntos: puntos
  };

  const mensaje = $('mensaje-juego');
  if (resultado.gano) {
    mensaje.textContent = '¡Ganaste! La palabra era «' + resultado.palabra + '».';
    mensaje.className = 'aviso exito';
  } else {
    mensaje.textContent = 'Perdiste. La palabra era «' + resultado.palabra + '».';
    mensaje.className = 'aviso error';
  }

  $('resumen-guardar').textContent = 'Tiempo: ' + resultado.tiempo + ' s — Puntos: ' + resultado.puntos;
  $('form-guardar').classList.remove('oculto');
}

async function alGuardar(evento) {
  evento.preventDefault();
  if (!resultado || puntajeGuardado) return;

  const nombre = $('nombre').value.trim();
  const error = validarNombre(nombre);
  $('error-nombre').textContent = error;
  if (error) return;

  try {
    await ApiScore.guardar({ nombre: nombre, tiempo: resultado.tiempo, puntos: resultado.puntos });
    puntajeGuardado = true;
    $('form-guardar').classList.add('oculto');
    mostrarAviso('Puntaje de «' + nombre + '» guardado.', 'exito');
    await cargarRanking();
  } catch (error) {
    mostrarAviso(error.message, 'error');
  }
}

// ===== Tabla de posiciones =====
async function cargarRanking() {
  try {
    puntajes = await ApiScore.listar();
    dibujarRanking();
  } catch (error) {
    mostrarAviso(error.message, 'error');
  }
}

function dibujarRanking() {
  const cuerpo = $('ranking-cuerpo');
  cuerpo.innerHTML = '';
  $('ranking-vacio').classList.toggle('oculto', puntajes.length > 0);

  puntajes.forEach((puntaje, i) => {
    const fila = crear('tr');
    fila.appendChild(crear('td', i + 1));

    // Nombre: texto normal o campo de edición dentro de la propia fila
    const celdaNombre = crear('td');
    if (puntaje.id === editandoId) {
      const entrada = crear('input');
      entrada.type = 'text';
      entrada.id = 'input-edicion';
      entrada.maxLength = 20;
      entrada.value = puntaje.nombre;
      entrada.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') guardarEdicion(puntaje.id, entrada.value);
      });
      celdaNombre.appendChild(entrada);
    } else {
      celdaNombre.textContent = puntaje.nombre;
    }
    fila.appendChild(celdaNombre);

    fila.appendChild(crear('td', puntaje.puntos));
    fila.appendChild(crear('td', puntaje.tiempo + ' s'));
    fila.appendChild(crear('td', new Date(puntaje.fecha).toLocaleString('es-AR')));

    const celdaAcciones = crear('td');
    const acciones = crear('div', undefined, 'acciones');
    if (puntaje.id === editandoId) {
      acciones.appendChild(crearBoton('Guardar cambios', 'primario', () => {
        guardarEdicion(puntaje.id, $('input-edicion').value);
      }));
      acciones.appendChild(crearBoton('Cancelar edición', '', () => {
        editandoId = null;
        dibujarRanking();
      }));
    } else {
      acciones.appendChild(crearBoton('Editar', '', () => {
        editandoId = puntaje.id;
        dibujarRanking();
      }));
      acciones.appendChild(crearBoton('Borrar', 'peligro', () => {
        abrirModal(puntaje.id, puntaje.nombre);
      }));
    }
    celdaAcciones.appendChild(acciones);
    fila.appendChild(celdaAcciones);

    cuerpo.appendChild(fila);
  });

  const entradaEdicion = $('input-edicion');
  if (entradaEdicion) entradaEdicion.focus();
}

async function guardarEdicion(id, valor) {
  const nombre = valor.trim();
  const error = validarNombre(nombre);
  if (error) {
    mostrarAviso(error, 'error');
    return;
  }
  try {
    await ApiScore.editar(id, nombre);
    editandoId = null;
    mostrarAviso('Nombre actualizado.', 'exito');
    await cargarRanking();
  } catch (error) {
    mostrarAviso(error.message, 'error');
  }
}

// ===== Modal de confirmación para borrar =====
function abrirModal(id, nombre) {
  idAEliminar = id;
  $('modal-titulo').textContent = '¿Eliminar a «' + nombre + '»?';
  $('modal-texto').textContent = 'Se va a borrar su puntaje de la tabla. Esta acción no se puede deshacer.';
  $('modal').classList.remove('oculto');
  $('modal-cancelar').focus();
}

function cerrarModal() {
  idAEliminar = null;
  $('modal').classList.add('oculto');
}

async function confirmarBorrado() {
  const id = idAEliminar;
  cerrarModal();
  try {
    await ApiScore.borrar(id);
    mostrarAviso('Puntaje eliminado.', 'exito');
    await cargarRanking();
  } catch (error) {
    mostrarAviso(error.message, 'error');
  }
}

// ===== PDF (armado a mano, sin librerías) =====
// Convierte el texto a caracteres simples y escapa los que tienen significado en un PDF
function escaparPdf(texto) {
  return String(texto)
    .replace(/[^\x00-\xff]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

// lineas: lista de { texto, tam }. Devuelve un Blob con el PDF.
function crearPdf(lineas) {
  let y = 780;
  let contenido = '';
  lineas.forEach((linea) => {
    contenido += 'BT /F1 ' + linea.tam + ' Tf 50 ' + y + ' Td (' + escaparPdf(linea.texto) + ') Tj ET\n';
    y -= linea.tam + 16;
  });

  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Length ' + contenido.length + ' >>\nstream\n' + contenido + 'endstream'
  ];

  let pdf = '%PDF-1.4\n';
  const posiciones = [];
  objetos.forEach((objeto, i) => {
    posiciones.push(pdf.length);
    pdf += (i + 1) + ' 0 obj\n' + objeto + '\nendobj\n';
  });

  const inicioTabla = pdf.length;
  pdf += 'xref\n0 ' + (objetos.length + 1) + '\n0000000000 65535 f \n';
  posiciones.forEach((pos) => {
    pdf += String(pos).padStart(10, '0') + ' 00000 n \n';
  });
  pdf += 'trailer\n<< /Size ' + (objetos.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + inicioTabla + '\n%%EOF';

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 255;
  return new Blob([bytes], { type: 'application/pdf' });
}

// AAAAMMDD_HHMMSS
function marcaDeTiempo(fecha) {
  const dos = (n) => String(n).padStart(2, '0');
  return (
    fecha.getFullYear() + dos(fecha.getMonth() + 1) + dos(fecha.getDate()) +
    '_' + dos(fecha.getHours()) + dos(fecha.getMinutes()) + dos(fecha.getSeconds())
  );
}

function descargarPdf() {
  if (!resultado) {
    mostrarAviso('Primero terminá una partida para descargar tu score.', 'error');
    return;
  }

  const ahora = new Date();
  const nombre = $('nombre').value.trim() || 'Sin nombre';
  const lineas = [
    { texto: 'El ahorcado - Score actual', tam: 22 },
    { texto: 'Jugador: ' + nombre, tam: 14 },
    { texto: 'Palabra: ' + resultado.palabra, tam: 14 },
    { texto: 'Resultado: ' + (resultado.gano ? 'Ganó' : 'Perdió'), tam: 14 },
    { texto: 'Errores: ' + resultado.errores + ' de 6', tam: 14 },
    { texto: 'Tiempo: ' + resultado.tiempo + ' segundos', tam: 14 },
    { texto: 'Puntos: ' + resultado.puntos, tam: 14 },
    { texto: 'Fecha: ' + ahora.toLocaleString('es-AR'), tam: 14 }
  ];

  // Nombre de archivo sin tildes ni símbolos
  const nombreArchivo = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '') || 'jugador';

  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(crearPdf(lineas));
  enlace.download = 'score_' + nombreArchivo + '_' + marcaDeTiempo(ahora) + '.pdf';
  enlace.click();
  URL.revokeObjectURL(enlace.href);
  mostrarAviso('PDF descargado.', 'exito');
}

// ===== Modo claro / oscuro =====
function aplicarTema(tema) {
  document.documentElement.setAttribute('data-tema', tema);
  $('btn-tema').textContent = tema === 'oscuro' ? 'Modo claro' : 'Modo oscuro';
}

function cambiarTema() {
  const actual = document.documentElement.getAttribute('data-tema');
  const nuevo = actual === 'oscuro' ? 'claro' : 'oscuro';
  aplicarTema(nuevo);
  localStorage.setItem('tema', nuevo);
}

// ===== Eventos =====
$('btn-nueva').addEventListener('click', nuevaPartida);
$('btn-pdf').addEventListener('click', descargarPdf);
$('btn-tema').addEventListener('click', cambiarTema);
$('form-guardar').addEventListener('submit', alGuardar);
$('modal-cancelar').addEventListener('click', cerrarModal);
$('modal-eliminar').addEventListener('click', confirmarBorrado);
$('modal').addEventListener('click', (evento) => {
  if (evento.target === $('modal')) cerrarModal(); // clic en el fondo oscuro
});

document.addEventListener('keydown', (evento) => {
  const modalAbierto = !$('modal').classList.contains('oculto');
  if (evento.key === 'Escape' && modalAbierto) {
    cerrarModal();
    return;
  }
  // Letras del teclado físico (si no se está escribiendo en un campo)
  if (modalAbierto || evento.ctrlKey || evento.altKey || evento.metaKey) return;
  if (evento.target.tagName === 'INPUT') return;
  const letra = evento.key.toUpperCase();
  if (letra.length === 1 && LETRAS.includes(letra)) jugarLetra(letra);
});

// ===== Inicio =====
armarTeclado();
aplicarTema(localStorage.getItem('tema') || 'claro');
cargarRanking();
nuevaPartida();
