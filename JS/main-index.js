import { SteamTiendaAPI } from './endpoinst.js';

const contenedorMensajes = document.getElementById('mensajes-sistema');
const listaMasJugados = document.getElementById('lista-mas-jugados');
const listaMasVendidos = document.getElementById('lista-mas-vendidos');
const templateJugado = document.getElementById('template-juego-jugado');
const templateVendido = document.getElementById('template-juego-vendido');

document.addEventListener('DOMContentLoaded', inicializar);

async function inicializar() {
    mostrarMensaje("Cargando rankings...");

    try {
        const [masJugados, masVendidos] = await Promise.all([
            SteamTiendaAPI.top10JuegosMasJugados(),
            SteamTiendaAPI.top10MasVendidosHistorico()
        ]);

        renderizarRanking(masJugados, listaMasJugados, templateJugado, 'jugadores');
        renderizarRanking(masVendidos, listaMasVendidos, templateVendido, 'ventas');

        mostrarMensaje("");
    } catch (error) {
        mostrarMensaje(`Error al cargar los rankings: ${error.message}`);
    }
}

function renderizarRanking(resultado, contenedorLista, template, tipo) {
    contenedorLista.innerHTML = "";

    if (!resultado.encontrado || !resultado.juegos || resultado.juegos.length === 0) {
        const itemVacio = document.createElement('li');
        itemVacio.textContent = resultado.motivo || "No se pudo cargar el ranking.";
        contenedorLista.appendChild(itemVacio);
        return;
    }

    resultado.juegos.forEach(juego => {
        const clon = template.content.cloneNode(true);

        const imgEl = clon.querySelector('.ranking-img');
        const urlOficialSteam = `https://cdn.akamai.steamstatic.com/steam/apps/${juego.id}/capsule_184x69.jpg`;
        imgEl.src = juego.imagenCapsula || urlOficialSteam;
        imgEl.onerror = () => { imgEl.style.display = 'none'; };

        clon.querySelector('.ranking-nombre').textContent = juego.nombre;
        clon.querySelector('.ranking-appid').textContent = juego.id;
        clon.querySelector('.ranking-precio').textContent = juego.precioActual !== null ? `$${juego.precioActual}` : "Gratis";
        clon.querySelector('.ranking-dato').textContent = construirDato(juego, tipo);

        contenedorLista.appendChild(clon);
    });
}

function construirDato(juego, tipo) {
    if (tipo === 'jugadores') {
        return `${juego.jugadoresActuales.toLocaleString()} jugadores activos`;
    }

    if (tipo === 'ventas') {
        const ganancia = juego.gananciaBrutaEstimada > 0
            ? `$${juego.gananciaBrutaEstimada.toLocaleString()}`
            : "N/A";
        return `${juego.ventasEstimadas.toLocaleString()} copias vendidas (${ganancia})`;
    }

    return "";
}

function mostrarMensaje(texto) {
    contenedorMensajes.textContent = texto || "";
}