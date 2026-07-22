// modulo servidor: api mcsrvstat.us
export const ServidorAPI = {

  /**
   * Consulta el estado completo de un servidor de Minecraft.
   * @param {string} direccion - IP o dominio del servidor (ej: "hypixel.net")
   * @returns {Promise<Object>} Objeto plano con los datos ya normalizados
   */
  async obtenerEstado(direccion) {
    try {
      const respuesta = await fetch(`https://api.mcsrvstat.us/3/${direccion}`);

      if (!respuesta.ok) {
        throw new Error(`Error HTTP ${respuesta.status} al consultar el servidor`);
      }

      const datos = await respuesta.json();

      // si el server no existe o esta apagado no salta error se normaliza
      return {
        encontrado: true,
        online: datos.online === true,
        ip: datos.ip ?? null,
        puerto: datos.port ?? null,
        hostname: datos.hostname ?? direccion,
        version: datos.version ?? "Desconocida",
        jugadoresOnline: datos.players?.online ?? 0,
        jugadoresMax: datos.players?.max ?? 0,
        // configurado para demo.mcstatus.io
        listaJugadores: (datos.players?.list ?? []).map((jugador) =>
          typeof jugador === "string"
            ? { nombre: jugador, uuid: null }
            : { nombre: jugador.name, uuid: jugador.uuid ?? null }
        ),
        motd: datos.motd?.clean?.join(" ") ?? "",
        icono: datos.icon ?? null, // ya viene en base64, listo para <img src="">
      };
    } catch (error) {
      console.error("ServidorAPI.obtenerEstado:", error);
      return {
        encontrado: false,
        online: false,
        error: error.message,
      };
    }
  },

  /**
   * Check rápido de disponibilidad sin traer el JSON completo.
   * Útil para un "semáforo" de estado sin gastar memoria.
   * @param {string} direccion
   * @returns {Promise<boolean>}
   */
  async estaEnLinea(direccion) {
    try {
      const respuesta = await fetch(`https://api.mcsrvstat.us/simple/${direccion}`);
      return respuesta.ok; // 200 = online, 404 = offline
    } catch (error) {
      console.error("ServidorAPI.estaEnLinea:", error);
      return false;
    }
  },
};


// modulo jugador: obtenemos uuid mendiante usuario gracias playerdb para pasarla por crafatar y asi obtener visuales
//viable para utilar src en <image>
export const JugadorAPI = {

  crafatarBase: "https://crafatar.skyblock.net",

  /**
   * Arma las 3 URLs de imagen de Crafatar a partir de un UUID ya conocido.
   * Separado en su propio método porque a veces YA tenemos el UUID
   * (ej: mcsrvstat nos lo da directo vía query) y no hace falta
   * gastar una llamada a PlayerDB solo para llegar al mismo dato.
   * @param {string} uuid
   * @returns {Object}
   */
  construirUrls(uuid) {
    return {
      avatarUrl: `${this.crafatarBase}/avatars/${uuid}?size=128&overlay`,
      headRenderUrl: `${this.crafatarBase}/renders/head/${uuid}?scale=6&overlay`,
      bodyRenderUrl: `${this.crafatarBase}/renders/body/${uuid}?scale=6&overlay`,
    };
  },

  /**
   * Consulta PlayerDB con un username o UUID y arma las URLs de imagen.
   * Usar SOLO cuando no tenemos el UUID de antemano (caso más común:
   * el servidor únicamente expone nombres).
   * @param {string} identificador - username o UUID de Minecraft (string)
   * @returns {Promise<Object>}
   */
  async obtenerJugador(identificador) {
    //se espera un string asi que se corta si es otra cosa y se limpia 
    if (typeof identificador !== "string" || identificador.trim() === "") {
      console.error(
        "JugadorAPI.obtenerJugador: se esperaba un string, llegó:",
        identificador
      );
      return {
        encontrado: false,
        identificadorOriginal: identificador,
        motivo: "Identificador inválido (se esperaba un string)",
      };
    }

    try {
      const respuesta = await fetch(
        `https://playerdb.co/api/player/minecraft/${encodeURIComponent(identificador)}`
      );
      const datos = await respuesta.json();

      // PlayerDB responde 200/400 igual cuando no encuentra al jugador,
      // por eso hay que revisar el campo "success" del cuerpo, no
      // solo el status HTTP.
      if (!datos.success) {
        return {
          encontrado: false,
          identificadorOriginal: identificador,
          motivo: datos.message ?? "Jugador no encontrado",
        };
      }

      const jugador = datos.data.player;
      const uuid = jugador.id;

      return {
        encontrado: true,
        username: jugador.username,
        uuid,
        ...this.construirUrls(uuid),
      };
    } catch (error) {
      // Esto atrapa tanto errores de red como el caso de jugadores no legales
      console.error("JugadorAPI.obtenerJugador:", error);
      return {
        encontrado: false,
        identificadorOriginal: identificador,
        error: error.message,
      };
    }
  },
};


   // modulo server-jugadores : poco funcional para servver bien modificados que no muestran la lista de jugadores minima 
    // maximo de 12 puesto es lo que la peticion envia se puede ahumentar pero que muy poco probable encontrar server
export const JugadoresDelServidorAPI = {

  maximoJugadores: 12,

  /**
   * Devuelve la data combinada de servidor + jugadores resueltos.
   * @param {string} direccion - IP o dominio del servidor
   * @returns {Promise<Object>}
   */
  async obtenerJugadores(direccion) {
    const estadoServidor = await ServidorAPI.obtenerEstado(direccion);

    if (!estadoServidor.encontrado || !estadoServidor.online) {
      return {
        encontrado: false,
        jugadores: [],
        motivo: "Servidor no encontrado o desconectado",
      };
    }

    const nombresAConsultar = estadoServidor.listaJugadores.slice(
      0,
      this.maximoJugadores
    );

    if (nombresAConsultar.length === 0) {
      return {
        encontrado: true,
        jugadores: [],
        motivo:
          "El servidor no expone lista de jugadores (falta enable-query=true)",
      };
    }

        //allsettled para no tubar si una falla
    const resultados = await Promise.allSettled(
      nombresAConsultar.map((entrada) => {
        // Caso 1: el servidor ya nos dio el UUID (query)
        if (entrada.uuid) {
          return Promise.resolve({
            encontrado: true,
            username: entrada.nombre,
            uuid: entrada.uuid,
            ...JugadorAPI.construirUrls(entrada.uuid),
          });
        }
        // Caso 2 por nombre (playerdb)
        return JugadorAPI.obtenerJugador(entrada.nombre);
      })
    );

    const jugadoresResueltos = resultados
      .filter((r) => r.status === "fulfilled" && r.value.encontrado)
      .map((r) => r.value);

    return {
      encontrado: true,
      direccionServidor: direccion,
      totalOnlineEnServidor: estadoServidor.jugadoresOnline,
      totalConsultados: nombresAConsultar.length,
      totalResueltos: jugadoresResueltos.length,
      jugadores: jugadoresResueltos,
    };
  },
};

// aqui empieza steam
export const CONFIG = {
    API_KEY: "apikey-de-steam",
    BASE_URL: "https://api.steampowered.com",
  };

  const PROXIES_CORS = [
    (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];

  export async function fetchConProxy(urlReal, timeoutMs = 6000) {
    let ultimoError = null;

    for (const armarProxy of PROXIES_CORS) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const respuesta = await fetch(armarProxy(urlReal), { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        return await respuesta.json();
      } catch (error) {
        ultimoError = error;
      }
    }
    throw ultimoError ?? new Error("Todos los proxies fallaron o dieron timeout");
  }

  export async function fetchDirecto(url) {
    const respuesta = await fetch(url, { headers: { accept: "application/json" } });
    if (respuesta.status === 403) throw new Error("Endpoint bloqueado (403)");
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    return await respuesta.json();
  }

  export function construirUrlSteam(interfaz, metodo, version, parametros = {}) {
    const versionFormateada = `v${String(version).padStart(4, "0")}`;
    const url = new URL(`${CONFIG.BASE_URL}/${interfaz}/${metodo}/${versionFormateada}/`);
    
    url.searchParams.set("key", CONFIG.API_KEY);
    url.searchParams.set("format", "json");

    for (const [clave, valor] of Object.entries(parametros)) {
      if (valor !== undefined && valor !== null) {
        url.searchParams.set(clave, valor);
      }
    }
    return url.toString();
}

// usuario-steam
const ESTADOS_CONEXION = {
  0: "Desconectado", 1: "En línea", 2: "Ocupado",
  3: "Ausente", 4: "Durmiendo", 5: "Buscando intercambiar", 6: "Buscando jugar"
};

export const SteamUsuarioAPI = {
  async resumenPerfil(steamIds) {
    const listaIds = Array.isArray(steamIds) ? steamIds.join(",") : steamIds;
    try {
      const url = construirUrlSteam("ISteamUser", "GetPlayerSummaries", 2, { steamids: listaIds });
      const datos = await fetchConProxy(url);
      const jugadores = datos.response?.players ?? [];
      
      return {
        encontrado: jugadores.length > 0,
        jugadores: jugadores.map((j) => ({
          steamId: j.steamid,
          nombre: j.personaname,
          urlPerfil: j.profileurl,
          avatarGrande: j.avatarfull,
          estadoConexion: ESTADOS_CONEXION[j.personastate] ?? "Desconocido",
          perfilVisible: j.communityvisibilitystate === 3,
          fechaCreacionCuenta: j.timecreated ? new Date(j.timecreated * 1000) : null,
          jugandoAhora: j.gameextrainfo ?? null,
        })),
      };
    } catch (error) {
      return { encontrado: false, jugadores: [], error: error.message };
    }
  },

  async historialBaneos(steamIds) {
    const listaIds = Array.isArray(steamIds) ? steamIds.join(",") : steamIds;
    try {
      const url = construirUrlSteam("ISteamUser", "GetPlayerBans", 1, { steamids: listaIds });
      const datos = await fetchConProxy(url);
      const jugadores = datos.players ?? [];
      
      return {
        encontrado: jugadores.length > 0,
        jugadores: jugadores.map((j) => ({
          steamId: j.SteamId,
          baneadoVac: j.VACBanned,
          cantidadBaneosVac: j.NumberOfVACBans,
          diasDesdeUltimoBaneo: j.DaysSinceLastBan,
          baneadoComunidad: j.CommunityBanned,
          estadoEconomia: j.EconomyBan,
        })),
      };
    } catch (error) {
      return { encontrado: false, jugadores: [], error: error.message };
    }
  },

  async resolverVanityUrl(vanityUrl) {
    try {
      const url = construirUrlSteam("ISteamUser", "ResolveVanityURL", 1, { vanityurl: vanityUrl });
      const datos = await fetchConProxy(url);
      
      if (datos.response?.success !== 1) return { encontrado: false, motivo: "No existe perfil" };
      return { encontrado: true, steamId: datos.response.steamid };
    } catch (error) {
      return { encontrado: false, error: error.message };
    }
  }
};
 //biblioteca de usuario - enlazar con usuario a buscar
export const SteamBibliotecaAPI = {
  async juegosPoseidos(steamId) {
    try {
      const url = construirUrlSteam("IPlayerService", "GetOwnedGames", 1, {
        steamid: steamId, include_appinfo: 1, include_played_free_games: 1
      });
      const datos = await fetchConProxy(url);
      const juegos = datos.response?.games ?? [];

      return {
        encontrado: true,
        totalJuegos: datos.response?.game_count ?? juegos.length,
        juegos: juegos.map((j) => ({
          appId: j.appid,
          nombre: j.name,
          horasJugadas: Math.round((j.playtime_forever / 60) * 10) / 10,
      //  imagenCapsula: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${j.appid}/capsule_231x87.jpg`,
          imagenPortada: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${j.appid}/header.jpg`
        })),
      };
    } catch (error) {
      return { encontrado: false, juegos: [], error: error.message };
    }
  },

  async analizarValorBiblioteca(steamId) {
    const resultadoBiblioteca = await this.juegosPoseidos(steamId);
    
    if (!resultadoBiblioteca.encontrado || resultadoBiblioteca.juegos.length === 0) {
      return { encontrado: false, valorTotalCuenta: 0, juegos: [] };
    }

    const juegosUsuario = resultadoBiblioteca.juegos;
    const arrayDeIds = juegosUsuario.map(j => j.appId);
    const juegosConPrecio = [];
    let dineroTotalInvertido = 0;

    for (let i = 0; i < arrayDeIds.length; i += 50) { //en lotes de 50 papaito
      const loteIds = arrayDeIds.slice(i, i + 50);
      const stringIds = loteIds.join(',');

      try {
        const gamalytic = await fetchDirecto(`https://api.gamalytic.com/steam-games/list?appids=${stringIds}`); // no abusar
         
        for (const juego of juegosUsuario.slice(i, i + 50)) {
          const datosFinanzas = gamalytic.result?.find(g => String(g.steamId) === String(juego.appId)) || {};
          const precioActual = datosFinanzas.price || null; //precio por lote
          
          if (precioActual) {
            dineroTotalInvertido += precioActual;
          }

          juegosConPrecio.push({
            ...juego, // esto hereda appId, nombre, horas y las imagenes pero lo busque como implementa (... tienen propiedades raras) 
            precio: precioActual // null = Gratis
          });
        }
      } catch (error) {
        console.error(`Error calculando precios del lote ${stringIds}:`, error);
      }

      // Pausa rápida de seguridad
      if (i + 50 < arrayDeIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return {
      encontrado: true,
      totalJuegosProcesados: juegosConPrecio.length,
      valorTotalCuenta: Math.round(dineroTotalInvertido * 100) / 100, // Redondeo a 2 decimales
      juegos: juegosConPrecio
    };
  },

  async insignias(steamId) {
    try {
      const url = construirUrlSteam("IPlayerService", "GetBadges", 1, { steamid: steamId });
      const datos = await fetchConProxy(url);

      return {
        encontrado: true,
        nivelSteam: datos.response?.player_level ?? 0,
        xpActual: datos.response?.player_xp ?? 0,
      };
    } catch (error) {
      return { encontrado: false, insignias: [], error: error.message };
    }
  }
};

// bucador de la tienda con precio costo y dineto total generado 
// futuro agregarr algun comparador si precio = null 
export const SteamTiendaAPI = {
  async detallesCompletosJuego(appId) {
    try { 
      const [steamStore, gamalytic, steamReviews, statsJugadores] = await Promise.all([
        fetchConProxy(`https://store.steampowered.com/api/appdetails?appids=${appId}`),
        fetchDirecto(`https://api.gamalytic.com/steam-games/list?appids=${appId}`),
        fetchConProxy(`https://store.steampowered.com/appreviews/${appId}?json=1&language=spanish&purchase_type=all&num_per_page=20`),
        fetchConProxy(construirUrlSteam("ISteamUserStats", "GetNumberOfCurrentPlayers", 1, { appid: appId }))
      ]);

      const datosSteam = steamStore && steamStore[appId]?.success ? steamStore[appId].data : null;
      const datosFinanzas = gamalytic.result?.[0] || {};
      
      const jugadoresActuales = statsJugadores?.response?.player_count || 0; // captura los jugadores actuales si falla devuelve 0

      if (!datosSteam) return { encontrado: false, motivo: "Juego no encontrado o bloqueado por Steam" };

      // rese;as de sh****
      const totalResenas = steamReviews?.query_summary?.total_reviews || 0;
      let resenasAleatorias = [];
      
      if (steamReviews?.reviews && steamReviews.reviews.length > 0) {
        const mezcladas = steamReviews.reviews
          .filter(r => r.review && r.review.trim() !== "")
          .sort(() => 0.5 - Math.random());
          
        resenasAleatorias = mezcladas.slice(0, 3).map(r => ({
          recomendado: r.voted_up, 
          horasJugadas: r.author?.playtime_forever ? Math.round(r.author.playtime_forever / 60) : 0,
          texto: r.review
        }));
      }

      return {
        encontrado: true,
        juego: {
          id: appId,
          nombre: datosSteam.name,
          descripcion: datosSteam.short_description,
          imagenPortada: datosSteam.header_image,
          imagenCapsula: datosSteam.capsule_image,
          desarrolladores: datosSteam.developers ?? [],
          editores: datosSteam.publishers ?? [],
          etiquetas: datosSteam.genres?.map(g => g.description) ?? [],
          precioActual: datosFinanzas.price || null,
          ventasEstimadas: datosFinanzas.copiesSold || 0,
          gananciaBrutaEstimada: (datosFinanzas.price && datosFinanzas.copiesSold) ? Math.round(datosFinanzas.price * datosFinanzas.copiesSold) : 0,
          // Nuevo campo agregados
          jugadoresActuales: jugadoresActuales,
          totalResenas: totalResenas,
          resenasMuestra: resenasAleatorias
        }
      };
    } catch (error) {
      return { encontrado: false, error: error.message };
    }
  },

  async detallesMultiplesJuegos(arrayDeIds, tamanoLote = 10) {
    const idsUnicos = [...new Set(arrayDeIds.map(String).filter(Boolean))];
    const juegosEncontrados = [];

    for (let i = 0; i < idsUnicos.length; i += tamanoLote) {
      const loteIds = idsUnicos.slice(i, i + tamanoLote);
      const stringIds = loteIds.join(',');

      try {
        const [resultadosSteam, gamalytic] = await Promise.all([
          Promise.all(
            loteIds.map((id) =>
              Promise.all([
                fetchConProxy(`https://store.steampowered.com/api/appdetails?appids=${id}`),
                fetchConProxy(`https://store.steampowered.com/appreviews/${id}?json=1&language=spanish&purchase_type=all&num_per_page=1`),
                fetchConProxy(construirUrlSteam("ISteamUserStats", "GetNumberOfCurrentPlayers", 1, { appid: id }))
              ])

                .then(([datosApp, datosReviews, datosJugadores]) => ({ id, datosApp, datosReviews, datosJugadores }))
                .catch((error) => ({ id, datosApp: null, datosReviews: null, datosJugadores: null, error }))
            )
          ),
          fetchDirecto(`https://api.gamalytic.com/steam-games/list?appids=${stringIds}`)
        ]);

        for (const { id, datosApp, datosReviews, datosJugadores } of resultadosSteam) {
          const datosSteam = datosApp?.[id]?.success ? datosApp[id].data : null;
          const datosFinanzas = gamalytic.result?.find(g => String(g.steamId) === String(id)) || {};
          const totalResenas = datosReviews?.query_summary?.total_reviews || 0;
          const jugadoresActuales = datosJugadores?.response?.player_count || 0; //contador

          if (datosSteam) {
            juegosEncontrados.push({
              id,
              nombre: datosSteam.name,
              descripcion: datosSteam.short_description,
              imagenPortada: datosSteam.header_image,
              imagenCapsula: datosSteam.capsule_image,
              desarrolladores: datosSteam.developers ?? [],
              editores: datosSteam.publishers ?? [],
              etiquetas: datosSteam.genres?.map(g => g.description) ?? [],
              precioActual: datosFinanzas.price || null,
              ventasEstimadas: datosFinanzas.copiesSold || 0,
              gananciaBrutaEstimada: (datosFinanzas.price && datosFinanzas.copiesSold) ? Math.round(datosFinanzas.price * datosFinanzas.copiesSold) : 0,
              jugadoresActuales,
              totalResenas
            });
          }
        }
      } catch (error) {
        console.error(`Error procesando el lote ${stringIds}:`, error);
      }

      if (i + tamanoLote < idsUnicos.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return {
      encontrado: juegosEncontrados.length > 0,
      totalConsultados: idsUnicos.length,
      totalResueltos: juegosEncontrados.length,
      juegos: juegosEncontrados
    };
  },

  async buscarJuego(entrada) {
    const valor = String(entrada).trim();
    const esAppId = /^\d+$/.test(valor);

    if (esAppId) {
      return this.detallesCompletosJuego(valor); 
    }

    try {
      const urlBusqueda = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(valor)}&l=spanish&cc=US`;
      const datosBusqueda = await fetchConProxy(urlBusqueda);

      if (!datosBusqueda || !datosBusqueda.items || datosBusqueda.items.length === 0) {
        return { encontrado: false, motivo: `Sin coincidencias para "${valor}"` };
      }

      const mejorCoincidencia = datosBusqueda.items[0];
      const resultado = await this.detallesCompletosJuego(mejorCoincidencia.id);

      return {
        ...resultado,
        busquedaOriginal: valor,
        coincidenciaUsada: mejorCoincidencia.name,
        otrasOpciones: datosBusqueda.items.slice(1, 6).map(j => ({ id: j.id, nombre: j.name }))
      };
    } catch (error) {
      return { encontrado: false, motivo: "Error al buscar el juego por nombre", error: error.message };
    }
  },

  async top10JuegosMasJugados() {
    try {
      const url = construirUrlSteam("ISteamChartsService", "GetGamesByConcurrentPlayers", 1);
      const datos = await fetchConProxy(url);

      const ranking = datos.response?.ranks ?? [];
      
      if (ranking.length === 0) {
        return { encontrado: false, motivo: "No se pudo obtener el ranking actual de Steam" };
      }

      const top10Ids = ranking.slice(0, 10).map(juego => juego.appid);

      const resultadosTop10 = await this.detallesMultiplesJuegos(top10Ids, 10);

      if (resultadosTop10.juegos && resultadosTop10.juegos.length > 0) {
        resultadosTop10.juegos.sort((a, b) => b.jugadoresActuales - a.jugadoresActuales);
      }

      return {
        encontrado: resultadosTop10.encontrado,
        titulo: "Top 10 Juegos Más Jugados Actualmente",
        totalConsultados: resultadosTop10.totalConsultados,
        juegos: resultadosTop10.juegos
      };

    } catch (error) {
      console.error("Error al obtener el Top 10:", error);
      return { encontrado: false, error: error.message };
    }
  },

  async top10MasVendidosHistorico() {
    try {
      const gamalytic = await fetchDirecto(`https://api.gamalytic.com/steam-games/list?limit=10`);

      const rankingGamalytic = gamalytic.result ?? [];
      
      if (rankingGamalytic.length === 0) {
        return { encontrado: false, motivo: "No se pudo obtener el ranking de ventas de Gamalytic" };
      }

      const top10Ids = rankingGamalytic.map(juego => juego.steamId);

      const resultadosTop10 = await this.detallesMultiplesJuegos(top10Ids, 10);

      if (resultadosTop10.juegos && resultadosTop10.juegos.length > 0) {
        resultadosTop10.juegos.sort((a, b) => b.gananciaBrutaEstimada - a.gananciaBrutaEstimada);
      }

      return {
        encontrado: resultadosTop10.encontrado,
        titulo: "Top 10 Juegos Más Vendidos en la Historia (Estimado Gamalytic)",
        totalConsultados: resultadosTop10.totalConsultados,
        juegos: resultadosTop10.juegos
      };

    } catch (error) {
      console.error("Error al obtener el Top 10 más vendidos:", error);
      return { encontrado: false, error: error.message };
    }
  },

  // la llamda es muy parecida a masvendidos 

  /*async top10MasVendidosRecientes(diasAtras = 30) {
    try {
      const fechaActual = new Date();
      fechaActual.setDate(fechaActual.getDate() - diasAtras);
      
      const fechaFormateada = fechaActual.toISOString().split('T')[0];

      const urlGamalytic = `https://api.gamalytic.com/steam-games/list?limit=10&dateFrom=${fechaFormateada}`;
      
      const gamalytic = await fetchDirecto(urlGamalytic);
      const rankingGamalytic = gamalytic.result ?? [];
      
      if (rankingGamalytic.length === 0) {
        return { encontrado: false, motivo: `No se encontraron datos de ventas desde ${fechaFormateada}` };
      }

      const top10Ids = rankingGamalytic.map(juego => juego.steamId);

      const resultadosTop10 = await this.detallesMultiplesJuegos(top10Ids, 10);

      if (resultadosTop10.juegos && resultadosTop10.juegos.length > 0) {
        resultadosTop10.juegos.sort((a, b) => b.gananciaBrutaEstimada - a.gananciaBrutaEstimada);
      }

      return {
        encontrado: resultadosTop10.encontrado,
        titulo: `Top 10 Juegos Más Vendidos (Últimos ${diasAtras} días)`,
        fechaFiltro: fechaFormateada,
        totalConsultados: resultadosTop10.totalConsultados,
        juegos: resultadosTop10.juegos
      };

    } catch (error) {
      console.error("Error al obtener los más vendidos recientes:", error);
      return { encontrado: false, error: error.message };
    }
  }*/
};