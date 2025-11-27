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

function displayOp(op){
  return op === '~' ? '¬' :
         op === '&' ? '∧' :
         op === '|' ? '∨' :
         op === '^' ? '⊕' :
         op === '->' ? '→' :
         op === '<->' ? '↔' : op;
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

// Construye lista de nodos (variables ordenadas + subexpresiones en orden de evaluación)
// nodos: { id, label, op?, childrenIndexes? }
function buildNodeList(rpn, varsSorted){
  const varNodes = {};
  varsSorted.forEach(v => { varNodes[v] = { id: 'v:'+v, label: v, type: 'var', name: v }; });
  const stack = [];
  const intermediates = [];
  for (const tok of rpn){
    if (tok in OPERATORS){
      const ar = OPERATORS[tok].arity;
      if (ar === 1){
        const a = stack.pop();
        const label = `${displayOp(tok)}${a.label}`;
        const node = { id: 'n:'+intermediates.length, label, type:'op', op:tok, children: [a] };
        intermediates.push(node);
        stack.push(node);
      } else {
        const b = stack.pop(); const a = stack.pop();
        const label = `(${a.label}${displayOp(tok)}${b.label})`;
        const node = { id: 'n:'+intermediates.length, label, type:'op', op:tok, children: [a,b] };
        intermediates.push(node);
        stack.push(node);
      }
    } else {
      stack.push(varNodes[tok]);
    }
  }
  // order: variables (in varsSorted) then intermediates in creation order
  const nodes = varsSorted.map(v => varNodes[v]).concat(intermediates);
  return nodes;
}

// Evalúa lista de nodos para un env y produce valores y explicaciones
function evalNodesAndExplain(nodes, env){
  const values = {};
  const steps = [];
  // variables first
  for (const node of nodes){
    if (node.type === 'var'){
      const v = Boolean(env[node.name]);
      values[node.id] = v;
      steps.push(`Variable ${node.label} = ${boolText(v)}.`);
    } else {
      // children are references to earlier nodes (objects) - find their ids and values
      const childVals = node.children.map(ch => values[ch.id]);
      let res;
      if (node.children.length === 1){
        res = applyOp(node.op, childVals[0]);
        steps.push(`${node.label} = ${boolText(res)}  (porque ${opName(node.op)} ${childVals.map(boolText).join('')})`);
      } else {
        res = applyOp(node.op, childVals[0], childVals[1]);
        steps.push(`${node.label} = ${boolText(res)}  (porque ${opName(node.op)}: ${node.children[0].label}=${boolText(childVals[0])}, ${node.children[1].label}=${boolText(childVals[1])})`);
      }
      values[node.id] = res;
    }
  }
  // produce row values in same node order
  const row = nodes.map(n => boolText(values[n.id]));
  return { row, steps };
}

function findVars(tokens){ const vars = []; for (const t of tokens) if (/^[A-Za-z_]\w*$/.test(t) && !vars.includes(t)) vars.push(t); return vars; }

function generarFilasYDetallesConNodos(vars, rpn){
  const nodes = buildNodeList(rpn, vars);
  const rows = [];
  const details = [];
  const combos = 1 << vars.length;
  for (let i=0;i<combos;i++){
    const env = {};
    for (let j=0;j<vars.length;j++) env[vars[j]] = !!(i & (1 << (vars.length - 1 - j)));
    const { row, steps } = evalNodesAndExplain(nodes, env);
    rows.push(row);
    details.push({ combo: env, steps });
  }
  return { nodes, rows, details };
}

function renderTablaExplicativa(nodes, rows, details, expr, tokens, rpn){
  // header
  const headers = nodes.map(n => n.label);
  let html = '<thead><tr>' + headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('') + '</tr></thead><tbody>';
  for (let i=0;i<rows.length;i++){
    const row = rows[i];
    html += '<tr>' + row.map(c=>`<td>${escapeHtml(c)}</td>`).join('') + '</tr>';
    // detalle en la misma tabla: explicacion paso a paso
    const detailHtml = details[i].steps.map(s => escapeHtml(s)).join('<br>');
    html += `<tr class="detalle-row"><td colspan="${headers.length}"><strong>Explicación paso a paso:</strong><br>${detailHtml}</td></tr>`;
  }
  html += '</tbody>';
  tablaEl.innerHTML = html;

  // meta (tokens + RPN) y expresión original
  detallesEl.innerHTML = `<p><strong>Expresión:</strong> ${escapeHtml(expr)}</p>
    <p><strong>Tokens:</strong> ${escapeHtml(tokens.join(' '))}</p>
    <p><strong>RPN:</strong> ${escapeHtml(rpn.join(' '))}</p>`;
}

function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function calcularResultado(){
  const expr = pantalla.value.trim();
  if (!expr){ tablaEl.innerHTML = '<caption>Introduce una expresión.</caption>'; detallesEl.innerHTML = ''; return; }
  let tokens, rpn, vars;
  try{
    tokens = tokenize(expr);
    vars = findVars(tokens); vars.sort(); // sort variables to have consistent left-to-right order
    rpn = shuntingYard(tokens);
  } catch(e){
    tablaEl.innerHTML = `<caption>Error de parseo: ${escapeHtml(e.message)}</caption>`; detallesEl.innerHTML = ''; return;
  }

  if (vars.length === 0){
    try {
      // build nodes (only final node) to get label
      const nodes = buildNodeList(rpn, []);
      const { row, steps } = evalNodesAndExplain(nodes, {});
      tablaEl.innerHTML = `<caption>Resultado: ${escapeHtml(row[row.length-1])}</caption>`;
      detallesEl.innerHTML = `<p><strong>RPN:</strong> ${escapeHtml(rpn.join(' '))}</p><pre>${escapeHtml(steps.join('\n'))}</pre>`;
      return;
    } catch(e){
      tablaEl.innerHTML = `<caption>Error de evaluación: ${escapeHtml(e.message)}</caption>`; detallesEl.innerHTML = ''; return;
    }
  }

  const { nodes, rows, details } = generarFilasYDetallesConNodos(vars, rpn);
  renderTablaExplicativa(nodes, rows, details, expr, tokens, rpn);
}

// bloquear escritura directa salvo movimientos/backspace/ctrl
pantalla.addEventListener('keydown', (ev) => {
  const allowed = ['ArrowLeft','ArrowRight','Backspace','Delete','Home','End','Tab','Enter'];
  if (allowed.includes(ev.key) || (ev.ctrlKey || ev.metaKey)) return;
  ev.preventDefault();
});
window.addEventListener('load', ()=> focusCaret(0));
// ...existing code...