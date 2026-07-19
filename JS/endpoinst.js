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