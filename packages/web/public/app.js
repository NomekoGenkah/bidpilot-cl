/* global document, window, fetch, FileReader, TextEncoder, btoa, setTimeout, clearTimeout */
const $ = (id) => document.getElementById(id);
let tenders = [],
  matrix = null,
  stale = false,
  answers = {},
  currentId = '',
  running = false,
  searchTimer,
  selectionVersion = 0,
  mode = 'matrix',
  selected = '',
  page = 0,
  docsCache = [],
  tooltipOwner = null,
  pinned = false,
  helpTimer;
let replacing = '',
  agentState = null,
  offline = false;
const pageSize = 15,
  drafts = {};
const text = (tag, value, cls) => {
  const node = document.createElement(tag);
  node.textContent = value;
  if (cls) node.className = cls;
  return node;
};
const button = (label, action, cls = 'quiet') => {
  const b = text('button', label, cls);
  b.type = 'button';
  b.addEventListener('click', action);
  return b;
};
const help = (label, description) => {
  const b = text('button', '?', 'help');
  b.type = 'button';
  b.setAttribute('aria-label', label);
  b.dataset.help = description;
  return b;
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
  for (const b of document.querySelectorAll(
    '#generate, #demo, #replay-demo, #new-tender, #prepare-form button, #agent-retry, #agent-defer, #upload button[type=submit], .answer-actions .primary',
  ))
    b.disabled = value;
  $('tender').disabled = value;
  $('generate').disabled = value || !currentId;
  $('uploadbox').inert = value;
  $('prepare-form').inert = value;
  $('agent-answers').inert = value;
}
function status(r) {
  if (r.pendienteRevision) return { label: 'Revisar bases', cls: 'pending' };
  if (r.aplicabilidad === 'no_aplica') return { label: 'No aplica', cls: 'not-applicable' };
  if (r.contradiccion) return { label: 'Contradicción', cls: 'contradiction' };
  return {
    label:
      r.estado === 'cumple' ? 'Cumple' : r.estado === 'falta' ? 'Falta evidencia' : 'Por aclarar',
    cls: r.estado,
  };
}
function matches(r, filter) {
  if (filter === 'all') return true;
  if (filter === 'attention')
    return r.pendienteRevision || (r.aplicabilidad !== 'no_aplica' && r.estado !== 'cumple');
  if (filter === 'pending') return r.pendienteRevision;
  if (filter === 'contradiction') return r.contradiccion;
  if (filter === 'not-applicable') return r.aplicabilidad === 'no_aplica' && !r.pendienteRevision;
  return status(r).cls === filter;
}
function filtered() {
  const query = $('requirement-search').value.toLocaleLowerCase('es').trim();
  return (matrix?.rows ?? [])
    .filter(
      (r) =>
        (mode !== 'questions' || r.pregunta) &&
        matches(r, $('filter').value) &&
        ($('stage').value === 'all' || r.requisito.etapa === $('stage').value) &&
        (!query ||
          `${r.requirementId} ${r.requisito.descripcion} ${r.pregunta ?? ''}`
            .toLocaleLowerCase('es')
            .includes(query)),
    )
    .sort((a, b) => {
      const priority = (r) =>
        r.pendienteRevision ? 0 : r.contradiccion ? 1 : r.estado === 'falta' ? 2 : 3;
      return priority(a) - priority(b) || a.requirementId.localeCompare(b.requirementId);
    });
}
function switchMode(next) {
  mode = next;
  hideHelp();
  for (const item of ['matrix', 'questions', 'documents', 'submission']) {
    if (item === next) $(`tab-${item}`).setAttribute('aria-current', 'page');
    else $(`tab-${item}`).removeAttribute('aria-current');
  }
  $('documents-view').hidden = next !== 'documents';
  $('review-view').hidden = !['matrix', 'questions'].includes(next);
  $('submission-view').hidden = next !== 'submission';
  $('requirement-search').placeholder =
    next === 'questions' ? 'Buscar pregunta…' : 'Buscar requisito…';
  page = 0;
  if (next !== 'documents') render();
}
async function documents() {
  docsCache = await api('evidence');
  evidenceChoices('prepare-evidence', chosenEvidence('prepare-evidence'));
  $('count-documents').textContent = docsCache.length;
  $('documents').replaceChildren(
    ...docsCache.map((doc) => {
      const row = text('div', '', 'document-item'),
        info = text('div', '');
      info.append(
        text('strong', doc.name),
        text(
          'p',
          `${doc.kind === 'pdf' ? 'PDF' : doc.kind === 'archivo' ? 'Archivo' : 'Texto'} · ${doc.analysisStatus === 'sin_analizar' ? 'Sin analizar' : `${doc.pages.length} ${doc.pages.length === 1 ? 'página' : 'páginas'}`}${doc.fictional ? ' · Ficticio' : ''}`,
        ),
      );
      const open = button('Abrir', () => openDocument(doc));
      open.id = `doc-open-${doc.id}`;
      open.setAttribute('aria-label', `Abrir ${doc.name}`);
      const actions = text('div', '', 'document-actions');
      actions.append(
        open,
        button('Reemplazar', () => beginReplace(doc)),
        button('Retirar', () => retireDocument(doc)),
      );
      row.append(info, actions);
      return row;
    }),
  );
  if (!docsCache.length) {
    const empty = text('div', '', 'empty');
    empty.append(
      text('h1', 'Añade tus documentos'),
      text('p', 'PDF o texto con los antecedentes del proveedor.'),
    );
    $('documents').append(empty);
  }
}
function openDocument(doc, targetPage) {
  const viewer = $('document-viewer');
  viewer.hidden = false;
  viewer.parentElement.classList.add('has-viewer');
  viewer.replaceChildren();
  viewer.append(
    button('Cerrar', () => {
      viewer.hidden = true;
      viewer.parentElement.classList.remove('has-viewer');
      $(`doc-open-${doc.id}`)?.focus();
    }),
  );
  const title = text('h1', doc.name);
  title.tabIndex = -1;
  viewer.append(title);
  for (const p of doc.pages) {
    viewer.append(text('div', `Página ${p.page}${doc.fictional ? ' · Ficticio' : ''}`, 'source'));
    const body = text('pre', p.text || 'Página sin texto extraíble.');
    body.id = `doc-page-${p.page}`;
    viewer.append(body);
  }
  const originals = text('div', '', 'original-actions');
  if (doc.original) {
    for (const [label, inline] of doc.kind === 'archivo'
      ? [['Descargar', false]]
      : [
          ['Abrir original', true],
          ['Descargar', false],
        ]) {
      const a = text('a', label);
      a.href = `/api/evidence/${doc.id}/original${inline ? '?inline=1' : ''}`;
      if (inline) {
        a.target = '_blank';
        a.rel = 'noopener';
      } else a.download = '';
      originals.append(a);
    }
  } else
    originals.append(
      text(
        'p',
        'Original no disponible: solo se conserva el texto extraído. Puedes reemplazarlo con el archivo original.',
      ),
    );
  viewer.insertBefore(originals, title.nextSibling);
  if (doc.analysisStatus === 'sin_analizar')
    viewer.append(
      text(
        'p',
        doc.analysisNote ??
          'Guardado sin analizar. Este archivo no se utiliza como evidencia de cumplimiento.',
        'basis-warning',
      ),
    );
  title.focus();
  if (targetPage) $(`doc-page-${targetPage}`)?.scrollIntoView({ block: 'center' });
}
async function selectTender() {
  const version = ++selectionVersion,
    id = $('tender').value;
  if (currentId !== id) {
    selected = '';
    page = 0;
  }
  currentId = id;
  $('generate').disabled = true;
  matrix = null;
  agentState = null;
  answers = {};
  stale = false;
  if (id) {
    const [state, saved, agent] = await Promise.all([
      api(`tenders/${id}/matrix`),
      api(`tenders/${id}/answers`),
      api(`tenders/${id}/agent`),
    ]);
    if (version !== selectionVersion) return;
    matrix = state.matrix;
    stale = state.stale;
    answers = saved;
    agentState = agent;
  }
  render();
  busy(running);
}
function render() {
  $('count-matrix').textContent = matrix?.rows.length ?? '';
  $('count-questions').textContent = matrix?.rows.filter((r) => r.pregunta).length ?? '';
  $('profile').hidden =
    !matrix?.fictional &&
    !docsCache.some((d) => d.fictional && agentState?.run?.selectedEvidenceIds.includes(d.id));
  $('updated').textContent = stale
    ? 'Desactualizada'
    : matrix
      ? `Actualizado ${new Date(matrix.createdAt).toLocaleString('es-CL', { hour: '2-digit', minute: '2-digit' })}`
      : '';
  $('generate').textContent =
    agentState?.run?.mode === 'replay'
      ? 'Actualizar demo'
      : agentState?.run
        ? 'Actualizar paquete con Meta'
        : 'Preparar paquete con Meta';
  $('exportempty').hidden = Boolean(matrix && !stale);
  $('exportfolder').hidden =
    !matrix ||
    stale ||
    Boolean(agentState?.run && (agentState.run.status !== 'done' || agentState.stale));
  renderAgent();
  for (const id of ['exportjson', 'exportmd']) {
    $(id).hidden = !matrix || stale;
    if (matrix && !stale) {
      $(id).href = `/api/tenders/${currentId}/export?format=${id === 'exportmd' ? 'md' : 'json'}`;
      $(id).download = '';
    }
  }
  $('summary').replaceChildren();
  if (stale) {
    const warning = text(
      'p',
      'El análisis está desactualizado. Actualízalo antes de usar o exportar sus resultados.',
      'basis-warning',
    );
    $('summary').append(warning);
  }
  if (matrix)
    for (const [key, label] of [
      ['attention', 'Por resolver'],
      ['cumple', 'Cumple'],
      ['not-applicable', 'No aplica'],
      ['pending', 'Revisar bases'],
    ]) {
      const count = matrix.rows.filter((r) => matches(r, key)).length;
      const b = button('', () => {
        $('filter').value = key;
        page = 0;
        render();
      });
      b.append(text('strong', count), text('span', label));
      b.setAttribute('aria-pressed', String($('filter').value === key));
      $('summary').append(b);
    }
  const rows = filtered();
  if (selected && !rows.some((r) => r.requirementId === selected)) selected = '';
  page = Math.max(0, Math.min(page, Math.ceil(rows.length / pageSize) - 1));
  const table = document.createElement('table'),
    caption = text(
      'caption',
      mode === 'questions' ? 'Preguntas del análisis' : 'Requisitos del análisis',
    ),
    head = document.createElement('thead'),
    tr = document.createElement('tr');
  for (const label of [mode === 'questions' ? 'Pregunta' : 'Requisito', 'Estado']) {
    const th = text('th', label);
    th.scope = 'col';
    tr.append(th);
  }
  head.append(tr);
  table.append(caption, head);
  const tbody = document.createElement('tbody');
  for (const r of rows.slice(page * pageSize, (page + 1) * pageSize)) {
    const row = text(
        'tr',
        '',
        'requirement-row' + (selected === r.requirementId ? ' selected' : ''),
      ),
      cell = document.createElement('td'),
      state = document.createElement('td'),
      display = status(r);
    const title = mode === 'questions' ? r.pregunta : r.requisito.descripcion;
    const open = button(
      '',
      () => {
        selected = r.requirementId;
        render();
        $('detail-title')?.focus();
      },
      'requirement-button',
    );
    open.id = `open-${r.requirementId}`;
    open.setAttribute('aria-label', `${r.requirementId}: ${title}`);
    open.setAttribute('aria-expanded', String(selected === r.requirementId));
    open.setAttribute('aria-controls', 'detail');
    open.append(
      text('span', title.length > 150 ? title.slice(0, 147) + '…' : title, 'req-title'),
      text(
        'span',
        `${r.requirementId} · ${stageLabel(r.requisito.etapa)}${mode === 'questions' && answers[r.requirementId] ? ' · Respondida' : ''}`,
        'row-meta',
      ),
    );
    cell.append(open);
    state.append(text('span', display.label, `badge ${display.cls}`));
    row.append(cell, state);
    tbody.append(row);
  }
  table.append(tbody);
  $('matrix').replaceChildren(table);
  if (!rows.length) {
    const empty = text('div', '', 'empty');
    empty.append(
      text('h1', !matrix ? 'Todavía no hay un análisis' : 'No hay resultados con estos filtros'),
    );
    if (!matrix) {
      empty.append(
        button(
          !currentId
            ? offline
              ? 'Probar demo sin Meta'
              : 'Nueva postulación'
            : docsCache.length
              ? 'Analizar licitación'
              : 'Añadir evidencia',
          () => {
            if (!currentId) {
              $(offline ? 'replay-demo' : 'new-tender').click();
              return;
            }
            if (docsCache.length) void generate();
            else {
              switchMode('documents');
              $('uploadbox').open = true;
              $('docname').focus();
            }
          },
        ),
      );
    } else
      empty.append(
        button('Ver todos', () => {
          $('filter').value = 'all';
          $('stage').value = 'all';
          $('requirement-search').value = '';
          page = 0;
          render();
        }),
      );
    $('matrix').replaceChildren(empty);
  }
  $('range').textContent = rows.length
    ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, rows.length)} de ${rows.length}`
    : '';
  $('previous').disabled = page === 0;
  $('next').disabled = (page + 1) * pageSize >= rows.length;
  renderDetail(rows.find((r) => r.requirementId === selected));
}
const stageLabel = (stage) =>
  ({ oferta: 'Oferta', adjudicacion: 'Adjudicación', ejecucion: 'Ejecución' })[stage] ?? stage;
function renderDetail(r) {
  $('detail').hidden = !r;
  $('workbench').classList.toggle('has-detail', Boolean(r));
  if (!r) return;
  const panel = $('detail');
  panel.replaceChildren();
  const top = text('div', '', 'detailtop'),
    display = status(r);
  const close = button(
    'Volver a la lista',
    () => {
      const previous = selected;
      selected = '';
      render();
      $(`open-${previous}`)?.focus();
    },
    'quiet close-detail',
  );
  top.append(
    text('span', r.requirementId, 'reqid'),
    text('span', display.label, `badge ${display.cls}`),
    close,
  );
  panel.append(top);
  const title = text('h1', r.requisito.descripcion);
  title.id = 'detail-title';
  title.tabIndex = -1;
  panel.append(
    title,
    text(
      'p',
      `${stageLabel(r.requisito.etapa)} · ${r.requisito.naturaleza === 'obligacion' ? 'Obligación' : 'Criterio de evaluación'}`,
      'context',
    ),
  );
  if (r.pendienteRevision)
    panel.append(
      text(
        'p',
        'Las citas de este requisito necesitan revisión. Este resultado no permite afirmar cumplimiento.',
        'basis-warning',
      ),
    );
  const reason = text('div', '', 'rationale');
  reason.append(text('p', r.razon));
  panel.append(reason);
  if (r.requisito.condicionAplicacion)
    panel.append(text('h2', 'Condición'), text('p', r.requisito.condicionAplicacion));
  if (r.requisito.alternativasAceptadas.length) {
    panel.append(text('h2', 'Alternativas aceptadas'));
    const list = text('ul', '', 'condition');
    for (const a of r.requisito.alternativasAceptadas) list.append(text('li', a));
    panel.append(list);
  }
  for (const message of r.motivos)
    if (!message.includes('Las citas de las bases')) panel.append(text('p', message));
  const grid = text('div', '', 'citation-grid');
  for (const [label, items, isEvidence] of [
    ['Bases', r.requisito.citas, false],
    ['Evidencia', r.citasEvidencia, true],
  ]) {
    const section = document.createElement('section');
    section.append(text('h2', label));
    if (!items.length) section.append(text('p', 'No se encontró respaldo documental.'));
    for (const c of items)
      section.append(
        text(
          'div',
          `${isEvidence ? c.documento : 'Bases originales'} · pág. ${c.pagina}${c.fictional ? ' · Ficticio' : ''}`,
          'source',
        ),
        text('blockquote', c.texto),
      );
    grid.append(section);
  }
  panel.append(grid);
  if (r.pregunta) {
    const form = text('form', '', 'question'),
      label = text('label', r.pregunta),
      input = document.createElement('textarea');
    input.id = `answer-${r.requirementId}`;
    label.htmlFor = input.id;
    input.rows = 4;
    input.maxLength = 4000;
    input.required = true;
    const draftKey = `${currentId}:${r.requirementId}`;
    input.value = drafts[draftKey] ?? answers[r.requirementId] ?? '';
    input.addEventListener('input', () => {
      drafts[draftKey] = input.value;
    });
    const actions = text('div', '', 'answer-actions'),
      save = text('button', 'Guardar y actualizar', 'primary');
    save.type = 'submit';
    save.disabled = running;
    actions.append(
      save,
      help(
        'Qué acredita una respuesta',
        'Tu respuesta es una declaración y puede aclarar condiciones. No sustituye un certificado ni un documento exigido. Guardar vuelve a analizar la matriz completa con Meta.',
      ),
    );
    form.append(label, input, actions);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const id = currentId;
      busy(true);
      try {
        const next = { ...answers, [r.requirementId]: input.value.trim() };
        await api(`tenders/${id}/answers`, next);
        answers = next;
        drafts[draftKey] = undefined;
        stale = true;
        busy(false);
        if (agentState?.run) {
          await selectTender();
          notice('Respuesta guardada. Continúa desde las preguntas del agente.');
        } else await generate();
      } catch (e) {
        busy(false);
        notice(e.message);
      }
    });
    panel.append(form);
  } else if (answers[r.requirementId])
    panel.append(text('h2', 'Tu respuesta'), text('p', answers[r.requirementId]));
}
async function poll() {
  try {
    const job = await api('job');
    if (!job) {
      busy(false);
      return;
    }
    $('progress').textContent = job.message;
    if (currentId) {
      agentState = await api(`tenders/${currentId}/agent`);
      renderAgent();
    }
    if (job.status === 'running') {
      busy(true);
      setTimeout(poll, 1500);
      return;
    }
    if (job.status === 'error') notice(job.message);
    await refreshTenders(currentId);
    await selectTender();
    busy(false);
  } catch (e) {
    busy(false);
    notice(e.message);
  }
}
async function generate() {
  if (!currentId || running) return;
  notice('');
  if (!agentState?.run) {
    $('preparation').open = true;
    $('tender-id').value = currentId;
    $('existing-bases').checked = true;
    $('bases-file').required = false;
    evidenceChoices(
      'prepare-evidence',
      docsCache.map((d) => d.id),
    );
    $('tender-id').focus();
    return;
  }
  if (agentState.run.status === 'awaiting_user') {
    $('agent-answers').scrollIntoView({ block: 'center' });
    return;
  }
  busy(true);
  try {
    await api(`tenders/${currentId}/agent/continue`, {
      answers: {},
      defer: false,
      ...(['ready', 'error', 'done'].includes(agentState.run.status)
        ? { documentIds: chosenEvidence('retry-evidence') }
        : {}),
    });
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
      kind = file.name.toLowerCase().endsWith('.pdf')
        ? 'pdf'
        : /\.(txt|md|csv|json)$/iu.test(file.name) || file.type.startsWith('text/')
          ? 'texto'
          : 'archivo';
      content = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        reader.readAsDataURL(file);
      });
    }
    await api(replacing ? `evidence/${replacing}/replace` : 'evidence', {
      name,
      kind,
      content,
      fictional: $('fictional').checked,
      ...(file ? { originalName: file.name } : {}),
    });
    replacing = '';
    $('upload').querySelector('button[type=submit]').textContent = 'Guardar documento';
    $('document-viewer').hidden = true;
    $('document-viewer').parentElement.classList.remove('has-viewer');
    $('upload').reset();
    $('uploadbox').open = false;
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
function hideHelp() {
  if (tooltipOwner) {
    tooltipOwner.removeAttribute('aria-describedby');
    tooltipOwner.setAttribute('aria-expanded', 'false');
  }
  tooltipOwner = null;
  pinned = false;
  $('tooltip').hidden = true;
  clearTimeout(helpTimer);
}
function showHelp(owner) {
  if (tooltipOwner !== owner) hideHelp();
  tooltipOwner = owner;
  clearTimeout(helpTimer);
  const tip = $('tooltip');
  tip.textContent = owner.dataset.help;
  tip.hidden = false;
  owner.setAttribute('aria-describedby', 'tooltip');
  owner.setAttribute('aria-expanded', 'true');
  const box = owner.getBoundingClientRect(),
    size = tip.getBoundingClientRect();
  tip.style.left = `${Math.max(12, Math.min(box.left, window.innerWidth - size.width - 12))}px`;
  tip.style.top = `${box.bottom + size.height + 10 < window.innerHeight ? box.bottom + 8 : Math.max(12, box.top - size.height - 8)}px`;
}
document.addEventListener('mouseover', (event) => {
  const owner = event.target.closest('.help');
  if (owner && !pinned) showHelp(owner);
  if (event.target.closest('#tooltip')) clearTimeout(helpTimer);
});
document.addEventListener('mouseout', (event) => {
  if (pinned || document.activeElement === tooltipOwner) return;
  if (event.target.closest('.help') || event.target.closest('#tooltip'))
    helpTimer = setTimeout(hideHelp, 200);
});
document.addEventListener('focusin', (event) => {
  const owner = event.target.closest('.help');
  if (owner) showHelp(owner);
  else hideHelp();
});
document.addEventListener('click', (event) => {
  const owner = event.target.closest('.help');
  if (owner) {
    if (tooltipOwner === owner && pinned) hideHelp();
    else {
      showHelp(owner);
      pinned = true;
    }
  } else if (!event.target.closest('#tooltip')) hideHelp();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideHelp();
    const menu = document.querySelector('.export-menu');
    if (menu.open) menu.open = false;
  }
});
window.addEventListener('resize', hideHelp);
window.addEventListener(
  'scroll',
  () => {
    if (tooltipOwner && document.activeElement === tooltipOwner) showHelp(tooltipOwner);
    else hideHelp();
  },
  { passive: true },
);
$('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    try {
      const query = $('search').value;
      if (!query.trim()) {
        $('results').replaceChildren();
        return;
      }
      const results = await api(`search?q=${encodeURIComponent(query)}`);
      if ($('search').value !== query) return;
      $('results').replaceChildren(
        ...results.map((r) => {
          const b = button(
            '',
            () => {
              const doc = docsCache.find((d) => d.id === r.documentId);
              if (doc) openDocument(doc, r.page);
            },
            'search-result',
          );
          b.append(
            text('strong', `${r.name} · pág. ${r.page}`),
            text('span', r.text.slice(0, 220)),
          );
          return b;
        }),
      );
      if (!results.length) $('results').append(text('p', 'No se encontraron fragmentos.'));
    } catch (e) {
      notice(e.message);
    }
  }, 300);
});
for (const item of ['matrix', 'questions', 'documents', 'submission'])
  $(`tab-${item}`).addEventListener('click', () => switchMode(item));
$('generate').addEventListener('click', generate);
$('tender').addEventListener('change', () => {
  void selectTender().catch((e) => notice(e.message));
});
for (const id of ['filter', 'stage'])
  $(id).addEventListener('change', () => {
    page = 0;
    render();
  });
$('requirement-search').addEventListener('input', () => {
  page = 0;
  render();
});
$('previous').addEventListener('click', () => {
  page--;
  render();
});
$('next').addEventListener('click', () => {
  page++;
  render();
});
async function init() {
  try {
    offline = (await api('settings')).offline;
    $('connection-mode').textContent = offline ? 'Reproducción sin conexión' : 'Local';
    $('new-tender').hidden = offline;
    $('preparation').hidden = offline;
    await refreshTenders();
    await documents();
    if (!tenders.length && !offline) {
      $('preparation').open = true;
      evidenceChoices('prepare-evidence', []);
    }
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

function beginReplace(doc) {
  if (running) return notice('Espera a que termine el análisis.');
  replacing = doc.id;
  switchMode('documents');
  $('upload').reset();
  $('docname').value = doc.name;
  $('fictional').checked = doc.fictional;
  $('upload').querySelector('button[type=submit]').textContent = 'Reemplazar documento';
  $('uploadbox').open = true;
  $('file').focus();
}
$('uploadbox').addEventListener('toggle', () => {
  if (!$('uploadbox').open && replacing) {
    replacing = '';
    $('upload').reset();
    $('upload').querySelector('button[type=submit]').textContent = 'Guardar documento';
  }
});
async function retireDocument(doc) {
  if (running) return notice('Espera a que termine el análisis.');
  if (
    !window.confirm(
      `¿Retirar «${doc.name}» del baúl? Las matrices quedarán desactualizadas. Se conservará una copia local en retirados.`,
    )
  )
    return;
  busy(true);
  try {
    await api(`evidence/${doc.id}/remove`, {});
    $('document-viewer').hidden = true;
    $('document-viewer').parentElement.classList.remove('has-viewer');
    await documents();
    await selectTender();
    notice('Documento retirado del baúl.');
  } catch (e) {
    notice(e.message);
  } finally {
    busy(false);
  }
}
$('exportfolder').addEventListener('click', async () => {
  try {
    const preview = await api(`tenders/${currentId}/package`);
    $('package-documents').replaceChildren(
      ...preview.documents.map((d) => {
        const label = text('label', '', 'package-document'),
          checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = d.id;
        checkbox.checked = d.cited && d.hasOriginal;
        checkbox.disabled = !d.hasOriginal;
        label.append(
          checkbox,
          text(
            'span',
            `${d.name}${d.cited ? ' · Citado' : ''}${!d.hasOriginal ? ' · Original no disponible' : d.analysisStatus === 'sin_analizar' ? ' · Sin analizar' : ''}`,
          ),
        );
        return label;
      }),
    );
    $('package-result').textContent = '';
    $('package-dialog').dataset.tender = currentId;
    $('package-dialog').showModal();
    document.querySelector('.export-menu').open = false;
  } catch (e) {
    notice(e.message);
  }
});
$('package-close').addEventListener('click', () => $('package-dialog').close());
$('package-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const save = $('package-save');
  save.disabled = true;
  $('package-close').disabled = true;
  try {
    const documentIds = [...$('package-documents').querySelectorAll('input:checked')].map(
      (i) => i.value,
    );
    const result = await api(`tenders/${$('package-dialog').dataset.tender}/package`, {
      destination: $('destination').value.trim(),
      documentIds,
    });
    $('package-result').textContent =
      `Copia guardada: ${result.path} (${result.documents} documentos).`;
  } catch (e) {
    $('package-result').textContent = e.message;
  } finally {
    save.disabled = false;
    $('package-close').disabled = false;
  }
});

$('package-dialog').addEventListener('cancel', (event) => {
  if ($('package-save').disabled) event.preventDefault();
});

function evidenceChoices(target, ids) {
  $(target).replaceChildren(
    ...docsCache.map((doc) => {
      const label = text('label', '', 'package-document'),
        input = document.createElement('input');
      input.type = 'checkbox';
      input.value = doc.id;
      input.checked = ids.includes(doc.id);
      label.append(
        input,
        text(
          'span',
          `${doc.name}${doc.fictional ? ' · Ficticio' : ''}${doc.analysisStatus === 'sin_analizar' ? ' · Sin analizar' : ''}`,
        ),
      );
      return label;
    }),
  );
  if (!docsCache.length)
    $(target).append(
      text(
        'p',
        'El baúl está vacío. Puedes añadir documentos o continuar dejando las brechas explícitas.',
      ),
    );
}
const chosenEvidence = (target) =>
  [...$(target).querySelectorAll('input:checked')].map((i) => i.value);
async function refreshTenders(id = currentId) {
  tenders = await api('tenders');
  $('tender').replaceChildren(
    ...tenders.map((t) => {
      const option = text(
        'option',
        `${t.id} · ${t.name}${t.mode === 'replay' ? ' · Sin Meta' : ''}`,
      );
      option.value = t.id;
      return option;
    }),
  );
  if (tenders.some((t) => t.id === id)) $('tender').value = id;
}
function renderAgent() {
  const run = agentState?.run;
  $('agent-work').hidden = !run;
  const replay = run?.mode === 'replay';
  $('mode-banner').hidden = !replay && !offline;
  $('mode-banner').textContent = replay
    ? 'Demo ficticia · Reproducción sin Meta. Los resultados siguen un escenario incluido; no representan una evaluación real.'
    : 'Servidor de reproducción sin conexiones externas. Para trabajar con tus bases y Meta, ejecuta npm start.';
  if (!run) {
    $('submission-content').replaceChildren(
      text('p', 'Inicia la preparación para obtener recomendación, riesgos, checklist y borrador.'),
    );
    return;
  }
  const labels = {
    ready: 'Listo para continuar',
    running: 'Agente trabajando',
    awaiting_user: 'Esperando tu decisión',
    done: 'Paquete preparado para revisión',
    error: 'Preparación interrumpida',
  };
  $('agent-status').textContent = `${labels[run.status]}${replay ? ' · Sin Meta' : ''}`;
  const followEvents =
    $('agent-events').scrollHeight - $('agent-events').scrollTop - $('agent-events').clientHeight <
    30;
  if ($('agent-timeline').dataset.status !== `${run.id}:${run.status}`) {
    $('agent-timeline').open = ['running', 'ready', 'error'].includes(run.status);
    $('agent-document-selection').open = ['ready', 'error'].includes(run.status);
    $('agent-timeline').dataset.status = `${run.id}:${run.status}`;
  }
  $('agent-events').replaceChildren(
    ...run.events.map((event) => {
      const item = text('li', '', `event-${event.kind}`);
      const time = text(
        'time',
        new Date(event.at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
      );
      time.dateTime = event.at;
      item.append(time, text('span', event.message));
      return item;
    }),
  );
  if (followEvents) $('agent-events').scrollTop = $('agent-events').scrollHeight;
  $('agent-error').hidden = run.status === 'done';
  $('agent-recovery').hidden = !['ready', 'error', 'done'].includes(run.status);
  $('agent-error').textContent =
    run.error ??
    (run.status === 'done'
      ? 'Puedes revisar la selección de evidencia y actualizar el paquete.'
      : 'Puedes continuar sin repetir los pasos completados.');
  $('agent-retry').textContent =
    run.status === 'done' ? 'Actualizar paquete' : 'Continuar desde el progreso guardado';
  const waiting = run.status === 'awaiting_user';
  $('agent-answers').hidden = !waiting;
  // No reemplazar controles mientras la persona escribe ni durante cada sondeo.
  const key = `${run.id}:${run.questions.map((q) => q.requirementId).join(',')}:${docsCache.map((d) => d.id + d.sha256).join(',')}`;
  if (['ready', 'error', 'done'].includes(run.status) && $('agent-recovery').dataset.key !== key) {
    $('agent-recovery').dataset.key = key;
    evidenceChoices('retry-evidence', run.selectedEvidenceIds);
  }
  if (waiting && $('agent-answers').dataset.key !== key) {
    $('agent-answers').dataset.key = key;
    $('agent-questions').replaceChildren(
      ...run.questions.map((q) => {
        const group = text('div', '', 'agent-question'),
          label = text('label', `${q.requirementId} · ${q.question}`),
          input = document.createElement('textarea');
        input.id = `agent-answer-${q.requirementId}`;
        input.dataset.requirement = q.requirementId;
        input.maxLength = 4000;
        input.rows = 3;
        input.value = answers[q.requirementId] ?? '';
        label.htmlFor = input.id;
        group.append(label, input);
        return group;
      }),
    );
    evidenceChoices('resume-evidence', run.selectedEvidenceIds);
  }
  const s = agentState.submission,
    container = $('submission-content');
  container.replaceChildren();
  if (!s) {
    container.append(
      text('h2', 'Paquete en preparación'),
      text(
        'p',
        'El agente guardará aquí la recomendación, los riesgos, el checklist y el borrador después de las preguntas.',
      ),
    );
    return;
  }
  if (agentState.stale || run.status !== 'done')
    container.append(
      text(
        'p',
        'Versión anterior. Continúa o actualiza el agente antes de exportar este paquete.',
        'basis-warning',
      ),
    );
  const decision = {
    no_go: 'No avanzar',
    pendiente: 'Decisión pendiente',
    go_condicionado: 'Avanzar sujeto a revisión',
  };
  container.append(
    text('h2', decision[s.recomendacion.decision]),
    ...s.recomendacion.razones.map((r) => text('p', r)),
    text(
      'p',
      `Cierre informado: ${s.recomendacion.fechaCierre ?? 'No disponible; revisar bases y portal.'}`,
    ),
  );
  if (!agentState.stale && run.status === 'done') {
    const link = text('a', 'Descargar paquete en Markdown');
    link.href = `/api/tenders/${currentId}/agent/submission`;
    link.download = '';
    container.append(link);
  }
  const addRefs = (parent, item) => {
    const detail = document.createElement('details');
    detail.append(text('summary', 'Ver sustento documental'));
    for (const c of item.bases)
      detail.append(text('p', `Bases · pág. ${c.pagina}`), text('blockquote', c.texto));
    for (const c of item.evidencia ?? [])
      detail.append(
        text('p', `${c.documento ?? c.documentId} · pág. ${c.pagina}`),
        text('blockquote', c.texto),
      );
    parent.append(detail);
  };
  for (const [title, list, describe] of [
    ['Riesgos', s.riesgos, (r) => `${r.asunto}\n${r.motivo}`],
    ['Brechas', s.brechas, (r) => `${r.descripcion}\n${r.razon}`],
    [
      'Checklist documental',
      s.checklist,
      (r) =>
        `${stageLabel(r.etapa)} · ${r.tarea}\n${r.accion}\nPlazo: ${r.plazoDocumental ?? 'No identificado; revisar bases.'}`,
    ],
    [
      'Borrador de propuesta técnica',
      s.propuesta.secciones,
      (r) =>
        `${r.titulo}\n${r.texto}${r.condicion ? `\nCondición: ${r.condicion}` : ''}${r.alternativas.length ? `\nAlternativas: ${r.alternativas.join('; ')}` : ''}`,
    ],
  ]) {
    const section = document.createElement('section');
    section.append(text('h2', title));
    if (title === 'Borrador de propuesta técnica')
      section.append(text('p', s.propuesta.introduccion));
    if (!list.length)
      section.append(
        text('p', 'Sin elementos identificados en esta matriz. Revisar las bases originales.'),
      );
    for (const item of list) {
      const article = text('article', '', 'submission-item');
      article.append(text('h3', item.requirementId), text('p', describe(item)));
      addRefs(article, item);
      section.append(article);
    }
    container.append(section);
  }
  container.append(text('h2', 'Por completar por el proveedor'));
  const list = document.createElement('ul');
  for (const p of s.propuesta.pendientesGenerales) list.append(text('li', p));
  container.append(list, text('p', s.recomendacion.limites));
}
$('new-tender').addEventListener('click', () => {
  $('prepare-form').reset();
  $('preparation').open = true;
  $('bases-file').required = true;
  evidenceChoices(
    'prepare-evidence',
    docsCache.filter((d) => !d.fictional).map((d) => d.id),
  );
  $('tender-id').focus();
});
$('existing-bases').addEventListener('change', () => {
  $('bases-file').required = !$('existing-bases').checked;
});
$('prepare-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const file = $('bases-file').files[0];
  if (!$('existing-bases').checked && (!file || file.size > 8 * 1024 * 1024))
    return notice('Selecciona las bases PDF de hasta 8 MB.');
  busy(true);
  try {
    let content;
    if (!$('existing-bases').checked)
      content = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('No se pudo leer el PDF.'));
        reader.readAsDataURL(file);
      });
    const result = await api('agent', {
      tenderId: $('tender-id').value.trim(),
      ...(content ? { content } : {}),
      existing: $('existing-bases').checked,
      documentIds: chosenEvidence('prepare-evidence'),
      confirmed: $('prepare-consent').checked,
    });
    $('preparation').open = false;
    await refreshTenders(result.tenderId);
    await selectTender();
    await poll();
  } catch (error) {
    busy(false);
    notice(error.message);
  }
});
$('replay-demo').addEventListener('click', async () => {
  busy(true);
  try {
    const result = await api('demo', {});
    await documents();
    await refreshTenders(result.tenderId);
    await selectTender();
    await poll();
  } catch (error) {
    busy(false);
    notice(error.message);
  }
});
async function continueAgent(defer) {
  const responses = Object.fromEntries(
    [...$('agent-questions').querySelectorAll('textarea')]
      .filter((input) => input.value.trim())
      .map((input) => [input.dataset.requirement, input.value.trim()]),
  );
  busy(true);
  try {
    await api(`tenders/${currentId}/agent/continue`, {
      answers: responses,
      defer,
      documentIds: chosenEvidence('resume-evidence'),
    });
    $('agent-answers').dataset.key = '';
    await poll();
  } catch (error) {
    busy(false);
    notice(error.message);
  }
}
$('agent-answers').addEventListener('submit', (event) => {
  event.preventDefault();
  void continueAgent(false);
});
$('agent-defer').addEventListener('click', () => {
  void continueAgent(true);
});
$('agent-retry').addEventListener('click', generate);
