/* global document, fetch, FileReader, TextEncoder, btoa, setTimeout, clearTimeout */
const $ = (id) => document.getElementById(id);
let tenders = [],
  matrix = null,
  stale = false,
  answers = {},
  currentId = '',
  running = false,
  searchTimer,
  selectionVersion = 0;
const text = (tag, value, cls) => {
  const node = document.createElement(tag);
  node.textContent = value;
  if (cls) node.className = cls;
  return node;
};
async function api(path, data) {
  const res = await fetch(
    `/api/${path}`,
    data === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
  );
  const result = await res.json();
  if (!res.ok) throw new Error(result.error ?? 'No se pudo completar la acción.');
  return result;
}
const notice = (message) => {
  $('notice').textContent = message;
};
function busy(value) {
  running = value;
  for (const b of document.querySelectorAll('button')) b.disabled = value;
  $('tender').disabled = value;
  $('generate').disabled = value || !currentId;
}
async function documents() {
  const docs = await api('evidence');
  $('documents').replaceChildren(
    ...docs.map((d) =>
      text('li', `${d.name} · ${d.pages.length} pág.${d.fictional ? ' · Ficticio' : ''}`),
    ),
  );
  if (!docs.length) $('documents').append(text('li', 'Todavía no hay documentos.'));
}
async function selectTender() {
  const version = ++selectionVersion;
  currentId = $('tender').value;
  const selectedId = currentId;
  $('generate').disabled = true;
  matrix = null;
  answers = {};
  stale = false;
  const tender = tenders.find((t) => t.id === currentId);
  $('tenderdetail').textContent = tender
    ? `${tender.requirements} requisitos candidatos para revisión. Las fechas de estas muestras históricas no se actualizan.`
    : 'Ingesta una licitación y extrae sus requisitos para empezar.';
  if (currentId) {
    const [state, savedAnswers] = await Promise.all([
      api(`tenders/${selectedId}/matrix`),
      api(`tenders/${selectedId}/answers`),
    ]);
    if (version !== selectionVersion) return;
    matrix = state.matrix;
    stale = state.stale;
    answers = savedAnswers;
  }
  $('generate').disabled = !currentId || running;
  render();
}
function citations(parent, title, items, evidence = false) {
  const details = document.createElement('details');
  details.append(text('summary', `${title} (${items.length})`));
  if (!items.length) details.append(text('p', 'No se encontró evidencia documental verificable.'));
  for (const c of items) {
    details.append(
      text(
        'div',
        `${evidence ? c.documento : 'Bases originales'} · página ${c.pagina}${c.fictional ? ' · Ficticio' : ''}`,
        'source',
      ),
      text('blockquote', c.texto),
    );
  }
  parent.append(details);
}
function render() {
  $('summary').replaceChildren();
  for (const id of ['exportjson', 'exportmd']) {
    $(id).hidden = !matrix || stale;
    if (matrix && !stale) {
      $(id).href = `/api/tenders/${currentId}/export?format=${id === 'exportmd' ? 'md' : 'json'}`;
      $(id).download = '';
    }
  }
  if (!matrix) {
    $('matrix').replaceChildren(
      text('div', 'Guarda evidencia y genera la matriz para revisar cada requisito.', 'empty'),
    );
    return;
  }
  if (stale)
    $('summary').append(text('span', 'Matriz desactualizada: genera nuevamente antes de usarla.'));
  if (matrix.fictional) $('summary').append(text('span', 'Perfil ficticio · Solo demostración'));
  for (const status of ['cumple', 'falta', 'dudoso'])
    $('summary').append(
      text('span', `${status}: ${matrix.rows.filter((r) => r.estado === status).length}`),
    );
  $('summary').append(
    text(
      'span',
      `pendientes de revisión: ${matrix.rows.filter((r) => r.pendienteRevision).length}`,
    ),
  );
  const filter = $('filter').value;
  const rows = matrix.rows.filter(
    (r) =>
      filter === 'all' ||
      (filter === 'pending'
        ? r.pendienteRevision
        : filter === 'questions'
          ? r.pregunta
          : r.estado === filter),
  );
  $('matrix').replaceChildren(
    ...rows.map((r) => {
      const article = text('article', '', 'row'),
        top = text('div', '', 'rowtop');
      top.append(
        text('span', r.requirementId, 'reqid'),
        text('span', r.estado, `badge ${r.estado}`),
      );
      if (r.pendienteRevision) top.append(text('span', 'Pendiente de revisión', 'badge pending'));
      article.append(
        top,
        text('h3', r.requisito.descripcion),
        text(
          'p',
          `${r.requisito.etapa} · ${r.requisito.naturaleza === 'obligacion' ? 'Obligación' : 'Criterio de evaluación'} · ${r.aplicabilidad === 'no_aplica' ? 'No aplica según la información disponible' : r.aplicabilidad === 'incierta' ? 'Aplicación por aclarar' : 'Aplica'}`,
          'hint',
        ),
      );
      if (r.requisito.condicionAplicacion)
        article.append(text('p', `Condición: ${r.requisito.condicionAplicacion}`));
      if (r.requisito.alternativasAceptadas.length)
        article.append(text('p', `Alternativas: ${r.requisito.alternativasAceptadas.join('; ')}`));
      article.append(text('p', r.razon));
      for (const reason of r.motivos) article.append(text('p', reason));
      if (r.contradiccion)
        article.append(text('p', 'Hay información contradictoria que debes revisar.'));
      citations(article, 'Ver citas de las bases', r.requisito.citas);
      citations(article, 'Ver evidencia del proveedor', r.citasEvidencia, true);
      if (r.pregunta) {
        const form = text('form', '', 'question'),
          label = text('label', r.pregunta),
          input = document.createElement('textarea');
        input.id = `answer-${r.requirementId}`;
        input.rows = 3;
        input.maxLength = 4000;
        input.required = true;
        input.value = answers[r.requirementId] ?? '';
        label.htmlFor = input.id;
        const button = text('button', 'Guardar respuesta y actualizar matriz');
        button.type = 'submit';
        button.disabled = running;
        form.append(
          label,
          input,
          text(
            'p',
            'Tu respuesta es una declaración. Si se requiere un documento, súbelo al baúl.',
            'hint',
          ),
          button,
        );
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          try {
            answers[r.requirementId] = input.value.trim();
            await api(`tenders/${currentId}/answers`, answers);
            await generate();
          } catch (e) {
            notice(e.message);
          }
        });
        article.append(form);
      } else if (answers[r.requirementId])
        article.append(text('p', `Tu declaración: ${answers[r.requirementId]}`));
      return article;
    }),
  );
  if (!rows.length) $('matrix').append(text('p', 'No hay requisitos con este filtro.'));
}
async function poll() {
  try {
    const job = await api('job');
    if (!job) return;
    $('progress').textContent = job.message;
    if (job.status === 'running') {
      busy(true);
      setTimeout(poll, 1500);
      return;
    }
    busy(false);
    if (job.status === 'error') notice(job.message);
    await selectTender();
  } catch (e) {
    busy(false);
    notice(e.message);
  }
}
async function generate() {
  if (!currentId || running) return;
  notice('');
  busy(true);
  try {
    await api(`tenders/${currentId}/matrix`, {});
    await poll();
  } catch (e) {
    busy(false);
    notice(e.message);
  }
}
function base64(textValue) {
  const bytes = new TextEncoder().encode(textValue);
  let s = '';
  for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s);
}
$('upload').addEventListener('submit', async (event) => {
  event.preventDefault();
  const file = $('file').files[0],
    name = $('docname').value.trim() || file?.name;
  if (!name) return notice('Escribe un nombre para el documento.');
  if (file && $('doctext').value.trim())
    return notice('Elige un archivo o pega texto, una opción a la vez.');
  if (!file && !$('doctext').value.trim()) return notice('Selecciona un archivo o pega su texto.');
  if (file && file.size > 8 * 1024 * 1024) return notice('El archivo supera 8 MB.');
  busy(true);
  try {
    let content = base64($('doctext').value),
      kind = 'texto';
    if (file) {
      kind = file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'texto';
      content = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        reader.readAsDataURL(file);
      });
    }
    await api('evidence', { name, kind, content, fictional: $('fictional').checked });
    $('upload').reset();
    await documents();
    await selectTender();
    notice('Documento guardado en este computador.');
  } catch (e) {
    notice(e.message);
  } finally {
    busy(false);
  }
});
$('demo').addEventListener('click', async () => {
  busy(true);
  try {
    const docs = await api('evidence');
    const samples = [
      [
        'Perfil ficticio · Taller Sur',
        'PERFIL FICTICIO DE PRUEBA. Taller Sur SpA es una persona jurídica chilena, sin UTP. Ofrece renovación de cinco licencias Adobe Creative Cloud All App para Teams con suscripción anual. La oferta se expresa en pesos chilenos e incluye impuestos. La propuesta técnica tiene vigencia de 30 días desde el cierre; la económica, 60 días desde el cierre. No hay certificado Partner Gold ni certificados de vigencia aportados.',
      ],
      [
        'Experiencia ficticia · versión A',
        'DOCUMENTO FICTICIO. Taller Sur SpA declara inicio de actividades en enero de 2010 y experiencia de 160 meses en el rubro de software al 20 de mayo de 2024. Este texto no es una cartola del SII.',
      ],
      [
        'Experiencia ficticia · versión B',
        'DOCUMENTO FICTICIO CONTRADICTORIO. Taller Sur SpA declara inicio de actividades en enero de 2023 y experiencia de 16 meses al 20 de mayo de 2024. No se ha aclarado cuál fecha es correcta.',
      ],
    ];
    for (const [name, value] of samples)
      if (!docs.some((d) => d.name === name))
        await api('evidence', { name, kind: 'texto', content: base64(value), fictional: true });
    await documents();
    await selectTender();
    notice('Perfil ficticio cargado. Sus datos solo sirven para demostrar el flujo.');
  } catch (e) {
    notice(e.message);
  } finally {
    busy(false);
  }
});
$('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    try {
      const results = await api(`search?q=${encodeURIComponent($('search').value)}`);
      $('results').replaceChildren(
        ...results.map((r) => text('p', `${r.name}, página ${r.page}: ${r.text.slice(0, 500)}`)),
      );
    } catch (e) {
      notice(e.message);
    }
  }, 300);
});
$('generate').addEventListener('click', generate);
$('tender').addEventListener('change', () => {
  void selectTender().catch((e) => notice(e.message));
});
$('filter').addEventListener('change', render);
async function init() {
  try {
    tenders = await api('tenders');
    $('tender').replaceChildren(
      ...tenders.map((t) => {
        const option = text('option', `${t.id} · ${t.name}`);
        option.value = t.id;
        return option;
      }),
    );
    await documents();
    await selectTender();
    const job = await api('job');
    if (job?.status === 'running') {
      if (currentId !== job.tenderId) {
        $('tender').value = job.tenderId;
        await selectTender();
      }
      await poll();
    }
  } catch (e) {
    notice(e.message);
  }
}
void init();
