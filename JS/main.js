import { ServidorAPI, JugadorAPI } from "./endpoinst.js";

const CLAVE_LOCALSTORAGE = "busquedas";

const formBusqueda = document.getElementById("form-busqueda");
const inputBusqueda = document.getElementById("input-busqueda");
const listaResultados = document.getElementById("lista-resultados");

// para el uuid
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

//verifica si el texto va para jugador o server
function detectarTipoBusqueda(texto) {
  if (REGEX_UUID.test(texto)) return "jugador";
  if (texto.includes(".")) return "servidor";
  return "jugador";
}

//lee array de localstorage
function leerBusquedasGuardadas() {
  try {
    const crudo = localStorage.getItem(CLAVE_LOCALSTORAGE);
    return crudo ? JSON.parse(crudo) : [];
  } catch (error) {
    console.error("main.js leerBusquedasGuardadas:", error);
    return [];
  }
}

//iteracion de escritura para ese array
function guardarBusquedas(busquedas) {
  localStorage.setItem(CLAVE_LOCALSTORAGE, JSON.stringify(busquedas));
}

//tarjeta del servidor(dom)
function crearTarjetaServidor(datos, id) {
  const tarjeta = document.createElement("div");
  tarjeta.className = "tarjeta";
  tarjeta.dataset.id = id;

  // online/ offline (falta icono para offline)
  const acciones = document.createElement("div");
  acciones.className = "tarjeta__acciones";

  const estado = document.createElement("img");
  estado.className = "tarjeta__estado";
  estado.src = datos.online ? "assets/images/Ping_Green_Dark.png" : "assets/images/offline.png";
  estado.alt = datos.online ? "en linea" : "desconectado";
  acciones.appendChild(estado);
  acciones.appendChild(crearBotonBorrar(id));
  tarjeta.appendChild(acciones);

  // miniatura del mundo/server icon
  const imagen = document.createElement("img");
  imagen.className = "tarjeta__imagen";
  imagen.src = datos.icono ?? "assets/images/default_world.png";
  imagen.alt = datos.hostname;
  tarjeta.appendChild(imagen);

  // nombre-mtod
  const info = document.createElement("div");
  info.className = "tarjeta__info";

  const nombre = document.createElement("span");
  nombre.className = "tarjeta__nombre";
  nombre.textContent = datos.hostname;
  info.appendChild(nombre);

  const jugadores = document.createElement("span");
  jugadores.className = "tarjeta__jugadores";
  jugadores.textContent = `jugadores: ${datos.jugadoresOnline}/${datos.jugadoresMax}`;
  if (datos.listaJugadores?.length) {
    jugadores.title = datos.listaJugadores.map((j) => j.nombre).join(", ");
  }
  info.appendChild(jugadores);

  if (datos.motd) {
    const detalle = document.createElement("span");
    detalle.className = "tarjeta__detalle";
    detalle.textContent = datos.motd;
    info.appendChild(detalle);
  }

  tarjeta.appendChild(info);

  // ip-puerto-version
  const derecha = document.createElement("div");
  derecha.className = "servidor__derecha";

  const ip = document.createElement("span");
  ip.textContent = datos.puerto ? `${datos.ip}:${datos.puerto}` : datos.ip ?? "-";
  derecha.appendChild(ip);

  const version = document.createElement("span");
  version.textContent = `v${datos.version}`;
  derecha.appendChild(version);

  tarjeta.appendChild(derecha);

  return tarjeta;
}

//tarjeta jugador
function crearTarjetaJugador(datos, id) {
  const tarjeta = document.createElement("div");
  tarjeta.className = "tarjeta";
  tarjeta.dataset.id = id;

  // delete papu
  const acciones = document.createElement("div");
  acciones.className = "tarjeta__acciones";
  acciones.appendChild(crearBotonBorrar(id));
  tarjeta.appendChild(acciones);

  // avartar-nombre
  const bloqueAvatar = document.createElement("div");
  bloqueAvatar.className = "jugador__bloque";

  const avatar = document.createElement("img");
  avatar.className = "jugador__avatar";
  avatar.src = datos.avatarUrl ?? "assets/images/icon_steve.png";
  avatar.alt = datos.username;
  bloqueAvatar.appendChild(avatar);

  const nombre = document.createElement("span");
  nombre.className = "tarjeta__nombre";
  nombre.textContent = datos.username;
  bloqueAvatar.appendChild(nombre);

  tarjeta.appendChild(bloqueAvatar);

  // uuid , render-head
  const bloqueHead = document.createElement("div");
  bloqueHead.className = "jugador__bloque";

  const head = document.createElement("img");
  head.className = "jugador__head";
  head.src = datos.headRenderUrl ?? "assets/images/icon_steve.png";
  head.alt = `${datos.username} - cabeza`;
  bloqueHead.appendChild(head);

  const uuid = document.createElement("span");
  uuid.className = "jugador__uuid";
  uuid.textContent = `uuid: ${datos.uuid}`;
  bloqueHead.appendChild(uuid);

  tarjeta.appendChild(bloqueHead);

  // render-body no se donde ponerlo lo puse a la derecha hay que cambiar la imagen default
  const body = document.createElement("img");
  body.className = "jugador__body";
  body.src = datos.bodyRenderUrl ?? "assets/images/icon_steve.png";
  body.alt = `${datos.username} - cuerpo completo`;
  tarjeta.appendChild(body);

  return tarjeta;
}

//la basura se comparte xd
function crearBotonBorrar(id) {
  const boton = document.createElement("button");
  boton.className = "tarjeta__borrar";
  boton.type = "button";
  boton.addEventListener("click", () => borrarBusqueda(id));

  const icono = document.createElement("img");
  icono.src = "assets/images/icon_trash.png";
  icono.alt = "borrar";
  boton.appendChild(icono);

  return boton;
}

//tarjeta-render al incio
function renderizarTarjeta(entrada) {
  const tarjeta =
    entrada.tipo === "servidor"
      ? crearTarjetaServidor(entrada.datos, entrada.id)
      : crearTarjetaJugador(entrada.datos, entrada.id);

  listaResultados.prepend(tarjeta);
}

//delete tarjeta o ubicacion del array
function borrarBusqueda(id) {
  const busquedas = leerBusquedasGuardadas().filter((b) => b.id !== id);
  guardarBusquedas(busquedas);

  const tarjeta = listaResultados.querySelector(`[data-id="${id}"]`);
  if (tarjeta) tarjeta.remove();
}

//aviso simple de busqueda no encontrada muy simple 
function avisarNoEncontrado() {
  inputBusqueda.style.borderColor = "red";
  setTimeout(() => {
    inputBusqueda.style.borderColor = "";
  }, 800);
}

//busca y carga el array para renderizarlo al abrir la pagina 
function cargarBusquedasGuardadas() {
  const busquedas = leerBusquedasGuardadas();
  // se recorre al reves para que, al hacer prepend, la primera del array
  // (la mas reciente) termine quedando arriba de todo
  for (let i = busquedas.length - 1; i >= 0; i--) {
    renderizarTarjeta(busquedas[i]);
  }
}

//maneja summit - consulta la api guardando y renderizando tambien responde pediente 
async function manejarBusqueda(evento) {
  evento.preventDefault();

  const texto = inputBusqueda.value.trim();
  if (texto === "") return;

  const tipo = detectarTipoBusqueda(texto);

  const resultado =
    tipo === "servidor"
      ? await ServidorAPI.obtenerEstado(texto)
      : await JugadorAPI.obtenerJugador(texto);

  if (!resultado.encontrado) {
    avisarNoEncontrado();
    return;
  }

  const entrada = {
    id: crypto.randomUUID(),
    tipo,
    datos: resultado,
  };

  const busquedas = leerBusquedasGuardadas();
  busquedas.unshift(entrada);
  guardarBusquedas(busquedas);

  renderizarTarjeta(entrada);
  inputBusqueda.value = "";
}

formBusqueda.addEventListener("submit", manejarBusqueda);
cargarBusquedasGuardadas();