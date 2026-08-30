// build/testdom.js
// Stub headless de DOM/SVG, SIN dependencias externas. Dueno unico: T-003 (build/testdom.js).
// NO se inyecta en el HTML final (prototype/index.html). Lo consumen los selfchecks de
// T-003, T-004 y T-005 vía `globalThis.window = globalThis; require('./testdom.js');`
// seguido de `Herzon.TestDOM.crearDocumento()`.
//
// Preambulo obligatorio (plan.md 3.A): script clasico, IIFE, sin import/export, idempotente.
(function () {
  var G = (typeof window !== 'undefined') ? window : globalThis;
  G.Herzon = G.Herzon || {};
  G.Herzon.TestDOM = G.Herzon.TestDOM || {};

  // Prohibido tocar `document` en el nivel superior del modulo (plan.md 3.A):
  // todo lo de abajo vive dentro de funciones.

  function crearNodoTexto(doc, texto) {
    var nodo = {
      nodeType: 3,
      ownerDocument: doc,
      parentNode: null,
      _data: texto == null ? '' : String(texto)
    };
    Object.defineProperty(nodo, 'textContent', {
      get: function () { return this._data; },
      set: function (v) { this._data = v == null ? '' : String(v); }
    });
    Object.defineProperty(nodo, 'data', {
      get: function () { return this._data; },
      set: function (v) { this._data = v == null ? '' : String(v); }
    });
    return nodo;
  }

  function buscarDescendientes(raiz, predicado) {
    var resultado = [];
    (function recorrer(nodo) {
      for (var i = 0; i < nodo.children.length; i++) {
        var hijo = nodo.children[i];
        if (predicado(hijo)) resultado.push(hijo);
        recorrer(hijo);
      }
    })(raiz);
    return resultado;
  }

  function consultarTodo(raiz, selector) {
    var esClase = selector.charAt(0) === '.';
    var clave = esClase ? selector.slice(1) : selector.toUpperCase();
    return buscarDescendientes(raiz, function (nodo) {
      if (esClase) return nodo._clases.indexOf(clave) !== -1;
      return nodo.tagName.toUpperCase() === clave;
    });
  }

  function crearElemento(doc, tag, ns) {
    var el = {
      nodeType: 1,
      tagName: ns ? String(tag) : String(tag).toUpperCase(),
      namespaceURI: ns || null,
      ownerDocument: doc,
      parentNode: null,
      children: [],
      childNodes: [],
      _atributos: {},
      _clases: [],
      _listeners: {}
    };

    el.style = {};

    el.setAttribute = function (nombre, valor) {
      this._atributos[nombre] = String(valor);
      if (nombre === 'class') {
        this._clases = String(valor).split(/\s+/).filter(function (c) { return c.length > 0; });
      }
      return undefined;
    };
    el.getAttribute = function (nombre) {
      return Object.prototype.hasOwnProperty.call(this._atributos, nombre) ? this._atributos[nombre] : null;
    };
    el.removeAttribute = function (nombre) {
      delete this._atributos[nombre];
      if (nombre === 'class') this._clases = [];
    };
    el.hasAttribute = function (nombre) {
      return Object.prototype.hasOwnProperty.call(this._atributos, nombre);
    };

    el.appendChild = function (hijo) {
      hijo.parentNode = this;
      this.childNodes.push(hijo);
      if (hijo.nodeType === 1) this.children.push(hijo);
      return hijo;
    };
    el.removeChild = function (hijo) {
      var iChild = this.childNodes.indexOf(hijo);
      if (iChild !== -1) this.childNodes.splice(iChild, 1);
      var iEl = this.children.indexOf(hijo);
      if (iEl !== -1) this.children.splice(iEl, 1);
      hijo.parentNode = null;
      return hijo;
    };

    el.addEventListener = function (tipo, manejador) {
      this._listeners[tipo] = this._listeners[tipo] || [];
      this._listeners[tipo].push(manejador);
    };
    el.removeEventListener = function (tipo, manejador) {
      var lista = this._listeners[tipo] || [];
      var idx = lista.indexOf(manejador);
      if (idx !== -1) lista.splice(idx, 1);
    };
    // Utilidad de prueba (no es DOM estandar): dispara los manejadores registrados
    // para `tipo`, en orden, sintetizando un evento minimo.
    el.despachar = function (tipo, detalle) {
      var lista = this._listeners[tipo] || [];
      var evento = { type: tipo, target: this, currentTarget: this, detail: detalle };
      for (var i = 0; i < lista.length; i++) lista[i](evento);
      return evento;
    };

    el.classList = {
      add: function () {
        for (var i = 0; i < arguments.length; i++) {
          var c = arguments[i];
          if (el._clases.indexOf(c) === -1) el._clases.push(c);
        }
        el._atributos['class'] = el._clases.join(' ');
      },
      remove: function () {
        for (var i = 0; i < arguments.length; i++) {
          var idx = el._clases.indexOf(arguments[i]);
          if (idx !== -1) el._clases.splice(idx, 1);
        }
        el._atributos['class'] = el._clases.join(' ');
      },
      contains: function (c) { return el._clases.indexOf(c) !== -1; },
      toggle: function (c, forzar) {
        var tiene = el._clases.indexOf(c) !== -1;
        var debeTener = (forzar === undefined) ? !tiene : !!forzar;
        if (debeTener && !tiene) this.add(c);
        if (!debeTener && tiene) this.remove(c);
        return debeTener;
      }
    };

    Object.defineProperty(el, 'textContent', {
      get: function () {
        var partes = [];
        (function recorrer(nodo) {
          if (nodo.nodeType === 3) { partes.push(nodo._data || ''); return; }
          for (var i = 0; i < nodo.childNodes.length; i++) recorrer(nodo.childNodes[i]);
        })(this);
        return partes.join('');
      },
      set: function (v) {
        this.children = [];
        this.childNodes = [];
        var nodoTexto = crearNodoTexto(doc, v);
        nodoTexto.parentNode = this;
        this.childNodes.push(nodoTexto);
      }
    });

    el.consultarTodo = function (selector) { return consultarTodo(this, selector); };
    el.consultarUno = function (selector) {
      var resultados = consultarTodo(this, selector);
      return resultados.length ? resultados[0] : null;
    };

    return el;
  }

  function crearDocumento() {
    var doc = {};
    doc.createElement = function (tag) { return crearElemento(doc, tag, null); };
    doc.createElementNS = function (ns, tag) { return crearElemento(doc, tag, ns); };
    doc.createTextNode = function (texto) { return crearNodoTexto(doc, texto); };
    return doc;
  }

  G.Herzon.TestDOM.crearDocumento = crearDocumento;
})();
