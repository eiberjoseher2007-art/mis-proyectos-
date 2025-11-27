// ...existing code...
const pantalla = document.getElementById('pantalla');
const tablaEl = document.getElementById('tabla');
const detallesEl = document.getElementById('detalles');

const OPERATORS = {
  '~':  {prec:5, assoc:'right', arity:1},
  '&':  {prec:4, assoc:'left',  arity:2},
  '^':  {prec:3, assoc:'left',  arity:2},
  '|':  {prec:2, assoc:'left',  arity:2},
  '->': {prec:1, assoc:'right', arity:2},
  '<->':{prec:0, assoc:'left',  arity:2},
};

function focusCaret(pos){ pantalla.focus(); const p = Math.max(0, Math.min(pantalla.value.length, pos)); pantalla.setSelectionRange(p,p); }
function getCaret(){ return pantalla.selectionStart ?? pantalla.value.length; }
function agregarValor(text){ const start = getCaret(); const end = pantalla.selectionEnd ?? start; pantalla.value = pantalla.value.slice(0,start) + text + pantalla.value.slice(end); focusCaret(start + text.length); }
function moverIzquierda(){ focusCaret(getCaret() - 1); }
function moverDerecha(){ focusCaret(getCaret() + 1); }
function borrarUltimo(){ const start = getCaret(); const end = pantalla.selectionEnd ?? start; if (start !== end){ pantalla.value = pantalla.value.slice(0,start) + pantalla.value.slice(end); focusCaret(start); return; } if (start === 0) return; pantalla.value = pantalla.value.slice(0,start-1) + pantalla.value.slice(end); focusCaret(start-1); }
function limpiarPantalla(){ pantalla.value = ''; tablaEl.innerHTML = ''; detallesEl.innerHTML = ''; focusCaret(0); }

// Normalización
function normalizeExpression(s){
  return s.replace(/¬/g,'~')
          .replace(/∧/g,'&')
          .replace(/∨/g,'|')
          .replace(/⊕/g,'^')
          .replace(/→/g,'->')
          .replace(/↔/g,'<->')
          .replace(/\s+/g,' ')
          .trim();
}

const TOKEN_RE = /\s*(<->|->|[()~&|^]|[A-Za-z_][A-Za-z0-9_]*)\s*/y;
function tokenize(expr){
  const s = normalizeExpression(expr);
  let pos = 0, m, tokens = [];
  TOKEN_RE.lastIndex = 0;
  while (pos < s.length){
    TOKEN_RE.lastIndex = pos;
    m = TOKEN_RE.exec(s);
    if (!m) throw new Error("Token inválido en: " + s.slice(pos));
    tokens.push(m[1]); pos = TOKEN_RE.lastIndex;
  }
  return tokens;
}

function shuntingYard(tokens){
  const out = [], stack = [];
  for (const tok of tokens){
    if (/^[A-Za-z_]\w*$/.test(tok)){ out.push(tok); }
    else if (tok === '('){ stack.push(tok); }
    else if (tok === ')'){
      while (stack.length && stack[stack.length-1] !== '(') out.push(stack.pop());
      if (!stack.length) throw new Error("Paréntesis mismatched");
      stack.pop();
    } else {
      if (!(tok in OPERATORS)) throw new Error("Operador desconocido: "+tok);
      const o1 = OPERATORS[tok];
      while (stack.length && (stack[stack.length-1] in OPERATORS)){
        const o2 = OPERATORS[stack[stack.length-1]];
        if ((o1.assoc === 'left' && o1.prec <= o2.prec) || (o1.assoc === 'right' && o1.prec < o2.prec)){
          out.push(stack.pop());
        } else break;
      }
      stack.push(tok);
    }
  }
  while (stack.length){
    const t = stack.pop();
    if (t === '(' || t === ')') throw new Error("Paréntesis mismatched");
    out.push(t);
  }
  return out;
}

function applyOp(op,a,b){
  if (op === '~') return !a;
  if (op === '&') return a && b;
  if (op === '|') return a || b;
  if (op === '^') return (a !== b);
  if (op === '->') return (!a) || b;
  if (op === '<->') return a === b;
  throw new Error("Operador no soportado: "+op);
}

function boolText(v){ return v ? 'V' : 'F'; }
function opName(op){
  return op === '~' ? 'NO' :
         op === '&' ? 'Y' :
         op === '|' ? 'O' :
         op === '^' ? 'XOR' :
         op === '->' ? 'IMPLICA' :
         op === '<->' ? 'EQUIVALENCIA' : op;
}

// Evalúa RPN y devuelve {value, trace} donde trace es array de pasos (strings con V/F)
function evalRPNWithTrace(rpn, env){
  const stack = [];
  const trace = [];
  for (const tok of rpn){
    if (tok in OPERATORS){
      const ar = OPERATORS[tok].arity;
      if (ar === 1){
        const a = stack.pop();
        const res = applyOp(tok, a);
        trace.push(`Se aplica ${opName(tok)} (${tok}) al valor ${boolText(a)} → resultado ${boolText(res)}.`);
        stack.push(res);
      } else {
        const b = stack.pop(); const a = stack.pop();
        const res = applyOp(tok, a, b);
        trace.push(`Se aplican ${opName(tok)} (${tok}) a ${boolText(a)} y ${boolText(b)} → resultado ${boolText(res)}.`);
        stack.push(res);
      }
    } else {
      const val = Boolean(env[tok]);
      stack.push(val);
      trace.push(`Variable ${tok} = ${boolText(val)} (se coloca en la pila).`);
    }
  }
  if (stack.length !== 1) throw new Error("Expresión inválida");
  return { value: stack[0], trace };
}

function evalRPN(rpn, env){
  return evalRPNWithTrace(rpn, env).value;
}

function findVars(tokens){ const vars = []; for (const t of tokens) if (/^[A-Za-z_]\w*$/.test(t) && !vars.includes(t)) vars.push(t); return vars; }

function generarFilasYDetalles(vars, rpn){
  const n = vars.length; const rows = []; const details = [];
  const combos = 1 << n;
  for (let i=0;i<combos;i++){
    const env = {}; for (let j=0;j<n;j++) env[vars[j]] = !!(i & (1<<(n-1-j)));
    let val, trace;
    try { const res = evalRPNWithTrace(rpn, env); val = res.value; trace = res.trace; }
    catch(e){ val = "ERR"; trace = [ "ERROR: " + e.message ]; }
    rows.push(vars.map(v => boolText(env[v]) ).concat([ (typeof val === 'boolean') ? boolText(val) : String(val) ]));
    details.push({
      combo: env,
      rpn: rpn.slice(),
      trace
    });
  }
  return { rows, details };
}

function renderTablaConDetalles(vars, rows, details, expr, tokens, rpn){
  // tabla con V/F y explicaciones en la misma tabla: cada fila seguida por una fila de detalle
  let html = '<thead><tr>' + vars.map(h=>`<th>${escapeHtml(h)}</th>`).join('') + `<th>${escapeHtml(expr)}</th></tr></thead><tbody>`;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    html += '<tr>' + row.map(c=>`<td>${escapeHtml(c)}</td>`).join('') + '</tr>';
    // fila de detalle con explicación paso a paso
    const detailText = details[i].trace.join('\n');
    html += `<tr class="detalle-row"><td colspan="${vars.length + 1}"><strong>Explicación paso a paso:</strong>\n<pre>${escapeHtml(detailText)}</pre></td></tr>`;
  }
  html += '</tbody>';
  tablaEl.innerHTML = html;

  // además mostrar tokens y RPN arriba de la tabla (en el mismo cuadro de resultados)
  const meta = `<div class="meta"><p><strong>Tokens:</strong> ${escapeHtml(tokens.join(' '))}</p><p><strong>RPN:</strong> ${escapeHtml(rpn.join(' '))}</p></div>`;
  detallesEl.innerHTML = meta;
}

function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function calcularResultado(){
  const expr = pantalla.value.trim();
  if (!expr){ tablaEl.innerHTML = '<caption>Introduce una expresión.</caption>'; detallesEl.innerHTML = ''; return; }
  let tokens, rpn, vars;
  try{
    tokens = tokenize(expr);
    vars = findVars(tokens); vars.sort();
    rpn = shuntingYard(tokens);
  } catch(e){
    tablaEl.innerHTML = `<caption>Error de parseo: ${escapeHtml(e.message)}</caption>`; detallesEl.innerHTML = ''; return;
  }

  if (vars.length === 0){
    try {
      const traceRes = evalRPNWithTrace(rpn, {});
      const val = traceRes.value;
      tablaEl.innerHTML = `<caption>Resultado: ${escapeHtml(boolText(val))}</caption>`;
      detallesEl.innerHTML = `<div class="meta"><p><strong>RPN:</strong> ${escapeHtml(rpn.join(' '))}</p><pre>${escapeHtml(traceRes.trace.join('\n'))}</pre></div>`;
      return;
    } catch(e){
      tablaEl.innerHTML = `<caption>Error de evaluación: ${escapeHtml(e.message)}</caption>`; detallesEl.innerHTML = ''; return;
    }
  }

  const { rows, details } = generarFilasYDetalles(vars, rpn);
  renderTablaConDetalles(vars, rows, details, expr, tokens, rpn);
}

// bloquear escritura directa salvo movimientos/backspace/ctrl
pantalla.addEventListener('keydown', (ev) => {
  const allowed = ['ArrowLeft','ArrowRight','Backspace','Delete','Home','End','Tab','Enter'];
  if (allowed.includes(ev.key) || (ev.ctrlKey || ev.metaKey)) return;
  ev.preventDefault();
});
window.addEventListener('load', ()=> focusCaret(0));
// ...existing code...