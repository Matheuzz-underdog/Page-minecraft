import { SteamUsuarioAPI, SteamBibliotecaAPI, SteamTiendaAPI } from './endpoinst.js';

const formulario = document.getElementById('formulario-busqueda');
const inputBusqueda = document.getElementById('input-busqueda');
const selectTipo = document.getElementById('tipo-busqueda');
const contenedorMensajes = document.getElementById('mensajes-sistema');
const contenedorUsuario = document.getElementById('contenedor-usuario');
const contenedorJuego = document.getElementById('contenedor-juego');

formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const valorBuscado = inputBusqueda.value.trim();
    const tipoSeleccionado = selectTipo.value;

    if (!valorBuscado) return;

    mostrarMensaje(`Buscando ${tipoSeleccionado}...`);
    contenedorUsuario.style.display = 'none';
    contenedorJuego.style.display = 'none';

    try {
        if (tipoSeleccionado === 'juego') {
            await procesarBusquedaJuego(valorBuscado);
        } else if (tipoSeleccionado === 'usuario') {
            await procesarBusquedaUsuario(valorBuscado);
        }
    } catch (error) {
        mostrarMensaje(`Error: ${error.message}`);
    }
});

async function procesarBusquedaJuego(entrada) {
    const resultado = await SteamTiendaAPI.buscarJuego(entrada);
    if (!resultado.encontrado) {
        mostrarMensaje(resultado.motivo || "Juego no encontrado.");
        return;
    }
    renderizarJuego(resultado);
}

async function procesarBusquedaUsuario(entrada) {
    let steamIdReal = entrada;
    const esSteamId64 = /^7656\d{13}$/.test(entrada);

    if (!esSteamId64) {
        const vanity = await SteamUsuarioAPI.resolverVanityUrl(entrada);
        if (!vanity.encontrado) {
            mostrarMensaje("Usuario no encontrado.");
            return;
        }
        steamIdReal = vanity.steamId;
    }

    const [perfil, baneos, insignias, biblioteca] = await Promise.all([
        SteamUsuarioAPI.resumenPerfil(steamIdReal),
        SteamUsuarioAPI.historialBaneos(steamIdReal),
        SteamBibliotecaAPI.insignias(steamIdReal),
        SteamBibliotecaAPI.analizarValorBiblioteca(steamIdReal)
    ]);

    if (!perfil.encontrado) {
        mostrarMensaje("El perfil no existe o está inactivo.");
        return;
    }

    renderizarUsuario(perfil.jugadores[0], baneos.jugadores[0], insignias, biblioteca);
}

//llenar mediante template
function renderizarJuego(resultado) {
    mostrarMensaje("");
    contenedorJuego.style.display = 'block';
    const juego = resultado.juego;

    // Textos e imágenes simples
    document.getElementById('juego-titulo').textContent = juego.nombre;
    document.getElementById('juego-portada').src = juego.imagenPortada;
    document.getElementById('juego-capsula').src = juego.imagenCapsula;
    document.getElementById('juego-descripcion').textContent = juego.descripcion;
    document.getElementById('juego-appid').textContent = juego.id;
    document.getElementById('juego-jugadores').textContent = juego.jugadoresActuales.toLocaleString();
    document.getElementById('juego-desarrolladores').textContent = juego.desarrolladores.join(', ');
    document.getElementById('juego-editores').textContent = juego.editores.join(', ');
    document.getElementById('juego-etiquetas').textContent = juego.etiquetas.join(', ');

    document.getElementById('juego-precio').textContent = juego.precioActual !== null ? `$${juego.precioActual}` : "Gratis";
    document.getElementById('juego-ventas').textContent = juego.ventasEstimadas.toLocaleString();
    document.getElementById('juego-ganancia').textContent = juego.gananciaBrutaEstimada > 0 ? `$${juego.gananciaBrutaEstimada.toLocaleString()}` : "N/A";
    document.getElementById('juego-resenas-titulo').textContent = `Reseñas de Usuarios (Total: ${juego.totalResenas.toLocaleString()})`;

    const contOpciones = document.getElementById('juego-opciones-container');
    const listaOpciones = document.getElementById('juego-opciones-lista');
    const templateOpcion = document.getElementById('template-opcion-busqueda');
    listaOpciones.innerHTML = "";

    if (resultado.otrasOpciones && resultado.otrasOpciones.length > 0) {
        contOpciones.style.display = 'block';
        resultado.otrasOpciones.forEach(opc => {
            const clon = templateOpcion.content.cloneNode(true);
            clon.querySelector('.opc-nombre').textContent = opc.nombre;
            clon.querySelector('.opc-id').textContent = opc.id;
            listaOpciones.appendChild(clon);
        });
    } else {
        contOpciones.style.display = 'none';
    }

    // Lista de reseñas usando Template
    const listaResenas = document.getElementById('juego-resenas-lista');
    const templateResena = document.getElementById('template-resena');
    listaResenas.innerHTML = "";

    juego.resenasMuestra.forEach(r => {
        const clon = templateResena.content.cloneNode(true);
        clon.querySelector('.resena-recomendacion').textContent = r.recomendado ? "✅ Recomendado" : "❌ No Recomendado";
        clon.querySelector('.resena-horas').textContent = r.horasJugadas;
        clon.querySelector('.resena-texto').textContent = `"${r.texto}"`;
        listaResenas.appendChild(clon);
    });
}

function renderizarUsuario(perfil, baneos, insignias, biblioteca) {
    mostrarMensaje("");
    contenedorUsuario.style.display = 'block';

    // Perfil
    document.getElementById('usuario-avatar').src = perfil.avatarGrande;
    document.getElementById('usuario-nombre').textContent = perfil.nombre;
    document.getElementById('usuario-steamid').textContent = perfil.steamId;
    document.getElementById('usuario-estado').textContent = perfil.estadoConexion;
    document.getElementById('usuario-visibilidad').textContent = perfil.perfilVisible ? "Público" : "Privado";
    document.getElementById('usuario-creacion').textContent = perfil.fechaCreacionCuenta ? new Date(perfil.fechaCreacionCuenta).toLocaleDateString() : "Oculta";
    document.getElementById('usuario-nivel').textContent = `${insignias.nivelSteam ?? 0} (XP: ${insignias.xpActual ?? 0})`;
    document.getElementById('usuario-link').href = perfil.urlPerfil;

    const jugandoContainer = document.getElementById('usuario-jugando-container');
    if (perfil.jugandoAhora) {
        jugandoContainer.style.display = 'list-item';
        document.getElementById('usuario-jugando').textContent = perfil.jugandoAhora;
    } else {
        jugandoContainer.style.display = 'none';
    }

    // Baneos
    document.getElementById('baneo-vac').textContent = baneos?.baneadoVac ? `Sí (${baneos.cantidadBaneosVac} registrados)` : "No";
    document.getElementById('baneo-dias').textContent = baneos?.diasDesdeUltimoBaneo > 0 ? baneos.diasDesdeUltimoBaneo : "N/A";
    document.getElementById('baneo-comunidad').textContent = baneos?.baneadoComunidad ? "Sí" : "No";
    document.getElementById('baneo-economia').textContent = baneos?.estadoEconomia ?? "Desconocido";

    // Biblioteca
    const divResumen = document.getElementById('usuario-biblioteca-resumen');
    const msjError = document.getElementById('usuario-biblioteca-error');

    if (biblioteca.encontrado && biblioteca.juegos.length > 0) {
        divResumen.style.display = 'block';
        msjError.style.display = 'none';

        document.getElementById('biblio-total').textContent = biblioteca.totalJuegosProcesados;
        document.getElementById('biblio-valor').textContent = `$${biblioteca.valorTotalCuenta.toLocaleString()}`;

        biblioteca.juegos.sort((a, b) => b.horasJugadas - a.horasJugadas);
        const top100Juegos = biblioteca.juegos.slice(0, 100);

        document.getElementById('biblio-summary').textContent = `Ver Top ${top100Juegos.length} juegos más jugados`;

        // Uso de Templates para la Biblioteca
        const listaJuegos = document.getElementById('biblio-lista');
        const templateBiblio = document.getElementById('template-juego-biblio');
        listaJuegos.innerHTML = ""; // Limpiar lista

        top100Juegos.forEach(j => {
            const clon = templateBiblio.content.cloneNode(true);

            const imgEl = clon.querySelector('.biblio-img');

            const urlOficialSteam = `https://cdn.akamai.steamstatic.com/steam/apps/${j.appId}/capsule_184x69.jpg`;
            imgEl.src = j.imagenCapsula || urlOficialSteam;

            imgEl.onerror = () => {
                imgEl.style.display = 'none';
            };

            clon.querySelector('.biblio-nombre').textContent = j.nombre;
            clon.querySelector('.biblio-appid').textContent = j.appId;
            clon.querySelector('.biblio-horas').textContent = j.horasJugadas;
            clon.querySelector('.biblio-precio').textContent = j.precio !== null ? `$${j.precio}` : "Gratis/Sin precio";

            listaJuegos.appendChild(clon);
        });
    } else {
        // Biblioteca privada, vacía o falló la consulta
        divResumen.style.display = 'none';
        msjError.style.display = 'block';
    }
}

function mostrarMensaje(texto) {
    contenedorMensajes.textContent = texto || "";
}