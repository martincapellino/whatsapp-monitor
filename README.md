# WhatsApp Monitor — Nucleus by Limitless

Monitorea grupos de clientes de WhatsApp y avisa al equipo cuando hay mensajes sin respuesta o seguimientos prometidos que quedaron en el aire.

---

## Cómo funciona

Cada N horas (configurable), el bot revisa los grupos de clientes buscando dos situaciones:

1. **Sin respuesta** — El cliente mandó algo y el equipo no contestó en más de X minutos
2. **Sin seguimiento** — Alguien del equipo dijo "ya lo vemos" (o similar) y no hubo avance

Cuando encuentra casos, manda un resumen al grupo del equipo, agrupado por responsable con @menciones:

```
📋 PENDIENTES — 15/05 18:00
━━━━━━━━━━━━━━━━━━━━━━━━━━

@Juan Carrizo
#alvaro-larraz Sin respuesta (2h 15min)
#juan-virola Sin seguimiento — "ahí lo vemos" (3h)

@Naza G
#ana-montana Sin respuesta (1h 40min)

━━━━━━━━━━━━━━━━━━━━━━━━━━
_3 grupo(s) con atención pendiente_
```

---

## Setup inicial

### 1. Instalá dependencias

```bash
npm install
```

### 2. Obtené los IDs de tus grupos

```bash
npm run list-groups
```

La primera vez te pide vincular tu número (pairing code). Seguí las instrucciones en pantalla.

Una vez conectado, te muestra todos tus grupos con sus IDs. Copiá los que necesitás.

### 3. Configurá el bot

```bash
cp config.example.json config.json
```

Editá `config.json`:

```json
{
  "teamGroupId": "ID del grupo interno del equipo",

  "teamMembers": [
    { "name": "Juan Carrizo", "phone": "5491112345678" },
    { "name": "Naza G",       "phone": "5491187654321" }
  ],

  "clientGroups": [
    {
      "id": "ID del grupo de alvaro",
      "clientName": "alvaro-larraz",
      "responsiblePhone": "5491112345678"
    },
    {
      "id": "ID del grupo de ana",
      "clientName": "ana-montana",
      "responsiblePhone": "5491187654321"
    }
  ],

  "checkIntervalHours": 3,
  "minWaitMinutes": 90,

  "pendingPhrases": [
    "ya lo vemos", "ahí lo vemos", "lo revisamos",
    "ahí te digo", "ya te digo", "en un momento",
    "ya te aviso", "dale ahora lo vemos", "te aviso"
  ]
}
```

**Campos importantes:**
- `teamGroupId` → el grupo donde el bot manda los resúmenes (solo el equipo)
- `teamMembers` → los teléfonos del equipo (para distinguir sus mensajes de los del cliente)
- `clientGroups` → los grupos de clientes a monitorear
- `responsiblePhone` → quién del equipo se encarga de ese grupo (para el @mention)
- `minWaitMinutes` → cuántos minutos deben pasar sin respuesta para alertar (recomendado: 90)

### 4. Iniciá el bot

```bash
npm start
```

La primera vez te pide vincular tu número. Las siguientes, se conecta solo.

---

## Agregar o quitar grupos

Simplemente editá `config.json` y reiniciá el bot. Sin código.

---

## Deploy en Railway (producción)

1. Crear cuenta en [railway.app](https://railway.app)
2. "New Project" → "Deploy from GitHub repo"
3. En Settings → agregar un **Persistent Volume** montado en `/app/auth_info` (para que la sesión sobreviva reinicios)
4. Agregá otro volumen en `/app/data` (para los mensajes persistidos)
5. En el primer deploy, mirá los logs para ingresar el pairing code

> **Nota:** La primera vinculación hay que hacerla mirando los logs de Railway. Después se reconecta solo.

---

## Archivos importantes

| Archivo | Descripción |
|---------|-------------|
| `config.json` | Tu configuración (en `.gitignore`, nunca se commitea) |
| `auth_info/` | Sesión de WhatsApp (en `.gitignore`, nunca se commitea) |
| `data/messages.json` | Mensajes de los últimas 48hs (en `.gitignore`) |

---

## Migración a WhatsApp Business

Cuando tengas el número Business:
1. Cerrá el bot
2. Borrá `auth_info/`
3. En `config.json` actualizá los `teamPhoneNumbers` si cambiaron
4. Corré `npm start` de nuevo y vinculá el nuevo número
