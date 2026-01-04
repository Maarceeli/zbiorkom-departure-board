const DEFAULT_API_URL = "https://api.zbiorkom.live/4.8";

class DepartureBoardCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("zbiorkom-departure-board-editor");
  }

  static getStubConfig() {
    return {
      api_url: DEFAULT_API_URL,
      stop_id: "",
      city: "kielce",
      title: "Odjazdy",
      show_stop_name: true,
      show_line_colors: true,
      show_realtime_indicator: true,
      max_departures: 5,
      update_interval: 60,
    };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._departures = [];
    this._stopInfo = null;
    this._loading = true;
    this._error = null;
    this._updateTimer = null;
  }

  set hass(hass) {
    this._hass = hass;
  }

  setConfig(config) {
    if (!config.stop_id) {
      throw new Error("Musisz podać stop_id");
    }

    this._config = {
      api_url: DEFAULT_API_URL,
      city: "kielce",
      title: "Bus Departures",
      show_stop_name: true,
      show_line_colors: true,
      show_realtime_indicator: true,
      max_departures: 5,
      update_interval: 60,
      ...config,
    };

    this._startUpdates();
  }

  connectedCallback() {
    this._startUpdates();
  }

  disconnectedCallback() {
    this._stopUpdates();
  }

  _startUpdates() {
    if (!this._config) return;

    this._fetchDepartures();

    this._stopUpdates();
    this._updateTimer = setInterval(
      () => this._fetchDepartures(),
      this._config.update_interval * 1000,
    );
  }

  _stopUpdates() {
    if (this._updateTimer) {
      clearInterval(this._updateTimer);
      this._updateTimer = null;
    }
  }

  async _fetchDepartures() {
    const { api_url, stop_id, city, max_departures } = this._config;

    try {
      this._loading = true;
      this._render();

      const url = `${api_url}/${city}/stops/getDepartures?id=${encodeURIComponent(stop_id)}&limit=${max_departures + 5}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      this._parseApiResponse(data);
      this._error = null;
    } catch (err) {
      console.error("Nie można pobrać danych o odjazdach:", err);
      this._error = err.message;
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _parseApiResponse(data) {
    const stopData = data[0];
    this._stopInfo = {
      stop_id: stopData[0],
      city: stopData[1],
      name: stopData[2],
      full_name: stopData[2],
      coordinates: stopData[3],
    };

    const departuresData = data[1] || [];
    this._departures = departuresData.map((dep) => {
      const lineInfo = dep[2] || [];
      const timeInfo = dep[7] || [];

      const scheduledTime = new Date(timeInfo[0]);
      const actualTime = new Date(timeInfo[1]);
      const delayRaw = timeInfo[2];

      const isRealtime = typeof delayRaw === "number";
      const delaySeconds = isRealtime ? delayRaw : null;

      return {
        trip_id: dep[0],
        destination: dep[1],
        line: {
          number: lineInfo[2],
          color: lineInfo[5] || "#44739e",
        },
        scheduled_time: scheduledTime,
        actual_time: actualTime,
        delay_seconds: delaySeconds,
        is_realtime: isRealtime,
        is_delayed: isRealtime && delaySeconds > 120,
        vehicle_id: dep[5] || null,
      };
    });
  }

  _formatMinutes(minutes) {
    if (minutes <= 0) return "Teraz";
    if (minutes === 1) return "1 min";
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      if (mins === 0) return `${hours} h`;
      return `${hours} h ${mins} min`;
    }
    return `${minutes} min`;
  }

  _getMinutesUntil(date) {
    const now = new Date();
    const diff = date - now;
    return Math.max(0, Math.floor(diff / 60000));
  }

  _formatTime(date) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  getCardSize() {
    return (
      1 + Math.min(this._departures.length, this._config?.max_departures || 5)
    );
  }

  _render() {
    if (!this._config) return;

    const departures = this._departures.slice(0, this._config.max_departures);
    const stopName = this._stopInfo?.full_name || this._stopInfo?.name || "";

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --departure-board-spacing: 12px;
        }

        ha-card {
          padding: 16px;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .title {
          font-size: 1.1rem;
          font-weight: 500;
          color: var(--primary-text-color);
        }

        .stop-name {
          font-size: 0.85rem;
          color: var(--secondary-text-color);
          margin-top: 2px;
        }

        .departures {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .departure-row {
          display: flex;
          align-items: center;
          padding: 10px 12px;
          background: var(--card-background-color, var(--ha-card-background));
          border-radius: 8px;
          border: 1px solid var(--divider-color, #e0e0e0);
        }

        .line-badge {
          min-width: 42px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          font-weight: 600;
          font-size: 0.95rem;
          color: white;
          margin-right: 12px;
          padding: 0 6px;
        }

        .departure-info {
          flex: 1;
          min-width: 0;
        }

        .destination {
          font-size: 0.95rem;
          font-weight: 500;
          color: var(--primary-text-color);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .scheduled-time {
          font-size: 0.8rem;
          color: var(--secondary-text-color);
          margin-top: 2px;
        }

        .time-info {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          margin-left: 12px;
        }

        .minutes {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--primary-text-color);
        }

        .minutes.now {
          color: var(--success-color, #4caf50);
        }

        .minutes.soon {
          color: var(--warning-color, #ff9800);
        }

        .realtime-indicator {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.75rem;
          color: var(--secondary-text-color);
          margin-top: 2px;
        }

        .realtime-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--success-color, #4caf50);
        }

        .realtime-dot.delayed {
          background: var(--error-color, #f44336);
        }

        .realtime-dot.scheduled {
          background: var(--secondary-text-color);
        }

        .no-departures, .loading, .error {
          text-align: center;
          padding: 24px;
          color: var(--secondary-text-color);
        }

        .error {
          color: var(--error-color, #f44336);
        }

        .loading-spinner {
          display: inline-block;
          width: 20px;
          height: 20px;
          border: 2px solid var(--secondary-text-color);
          border-radius: 50%;
          border-top-color: transparent;
          animation: spin 1s linear infinite;
          margin-right: 8px;
          vertical-align: middle;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      </style>

      <ha-card>
        <div class="header">
          <div>
            <div class="title">${this._config.title}</div>
            ${this._config.show_stop_name && stopName ? `<div class="stop-name">${stopName}</div>` : ""}
          </div>
        </div>

        ${
          this._loading && this._departures.length === 0
            ? `<div class="loading"><span class="loading-spinner"></span>Loading...</div>`
            : this._error && this._departures.length === 0
              ? `<div class="error">Error: ${this._error}</div>`
              : departures.length === 0
                ? `<div class="no-departures">Brak następnych odjazdów</div>`
                : `
                  <div class="departures">
                    ${departures.map((dep) => this._renderDeparture(dep)).join("")}
                  </div>
                `
        }
      </ha-card>
    `;
  }

  _renderDeparture(dep) {
    const lineColor =
      this._config.show_line_colors && dep.line.color
        ? dep.line.color
        : "var(--primary-color)";

    const minutes = this._getMinutesUntil(dep.actual_time);
    const minutesClass = minutes === 0 ? "now" : minutes <= 3 ? "soon" : "";

    const realtimeDotClass = !dep.is_realtime
      ? "scheduled"
      : dep.is_delayed
        ? "delayed"
        : "";

    const realtimeText = !dep.is_realtime
      ? "Planowo"
      : dep.is_delayed
        ? "Opóźniony"
        : "Na żywo";

    return `
      <div class="departure-row">
        <div class="line-badge" style="background-color: ${lineColor}">
          ${dep.line.number}
        </div>
        <div class="departure-info">
          <div class="destination">${dep.destination}</div>
          <div class="scheduled-time">${this._formatTime(dep.scheduled_time)}</div>
        </div>
        <div class="time-info">
          <div class="minutes ${minutesClass}">${this._formatMinutes(minutes)}</div>
          ${
            this._config.show_realtime_indicator
              ? `
            <div class="realtime-indicator">
              <span class="realtime-dot ${realtimeDotClass}"></span>
              <span>${realtimeText}</span>
            </div>
          `
              : ""
          }
        </div>
      </div>
    `;
  }
}

// Card Editor for UI configuration
class DepartureBoardCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  set hass(hass) {
    this._hass = hass;
  }

  setConfig(config) {
    this._config = config;
    this._render();
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        .form-group {
          margin-bottom: 16px;
        }
        label {
          display: block;
          margin-bottom: 4px;
          font-weight: 500;
        }
        input, select {
          width: 100%;
          padding: 8px;
          border: 1px solid var(--divider-color);
          border-radius: 4px;
          background: var(--card-background-color);
          color: var(--primary-text-color);
          box-sizing: border-box;
        }
        .checkbox-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .checkbox-group input {
          width: auto;
        }
        .hint {
          font-size: 0.8rem;
          color: var(--secondary-text-color);
          margin-top: 4px;
        }
      </style>

      <div class="form-group">
        <label for="stop_id">Id przystanku *</label>
        <input type="text" id="stop_id" value="${this._config.stop_id || ""}" placeholder="dworzec-kolejowy102" />
        <div class="hint">Id przystanku ze strony zbiorkom.live</div>
      </div>

      <div class="form-group">
        <label for="city">Miasto</label>
        <input type="text" id="city" value="${this._config.city || "kielce"}" placeholder="kielce" />
      </div>

      <div class="form-group">
        <label for="api_url">API URL</label>
        <input type="text" id="api_url" value="${this._config.api_url || DEFAULT_API_URL}" placeholder="https://api.zbiorkom.live/4.8" />
        <div class="hint">URL dla API (https://api.zbiorkom.live/4.8)</div>
      </div>

      <div class="form-group">
        <label for="title">Tytuł</label>
        <input type="text" id="title" value="${this._config.title || "Odjazdy"}" />
      </div>

      <div class="form-group">
        <label for="max_departures">Ilość odjazdów</label>
        <input type="number" id="max_departures" min="1" max="20" value="${this._config.max_departures || 5}" />
      </div>

      <div class="form-group">
        <label for="update_interval">Częstotliwość aktualizacji (seconds)</label>
        <input type="number" id="update_interval" min="10" max="300" value="${this._config.update_interval || 60}" />
      </div>

      <div class="form-group checkbox-group">
        <input type="checkbox" id="show_stop_name" ${this._config.show_stop_name !== false ? "sprawdzono" : ""} />
        <label for="show_stop_name">Wyświetl nazwę przstanku</label>
      </div>

      <div class="form-group checkbox-group">
        <input type="checkbox" id="show_line_colors" ${this._config.show_line_colors !== false ? "sprawdzono" : ""} />
        <label for="show_line_colors">Wyświetl kolor linii</label>
      </div>

      <div class="form-group checkbox-group">
        <input type="checkbox" id="show_realtime_indicator" ${this._config.show_realtime_indicator !== false ? "sprawdzono" : ""} />
        <label for="show_realtime_indicator">Wyświetl wyznacznik "Na żywo"</label>
      </div>
    `;

    // Add event listeners
    this.shadowRoot.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", (e) => this._valueChanged(e));
    });
  }

  _valueChanged(e) {
    const target = e.target;
    const id = target.id;
    let value = target.type === "checkbox" ? target.checked : target.value;

    if (id === "max_departures" || id === "update_interval") {
      value = parseInt(value, 10);
    }

    const newConfig = { ...this._config, [id]: value };

    const event = new CustomEvent("config-changed", {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }
}

// Register custom elements
customElements.define("zbiorkom-departure-board", DepartureBoardCard);
customElements.define(
  "zbiorkom-departure-board-editor",
  DepartureBoardCardEditor,
);

// Register with Home Assistant's custom card registry
window.customCards = window.customCards || [];
window.customCards.push({
  type: "zbiorkom-departure-board",
  name: "Tablica odjazdów z zbiorkom.live",
  description: "Wyświetla odjazdy z zbiorkom.live",
  preview: true,
  documentationURL:
    "https://git.marceeli.ovh/marceeli/zbiorkom-departure-board/",
});
