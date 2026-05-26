const STORAGE_KEY = "solairew.financeiro.v1";
const THEME_KEY = "solairew.financeiro.theme";
const SUPABASE_URL = "https://hkefapswaynegkidxidb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrZWZhcHN3YXluZWdraWR4aWRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTEzMjIsImV4cCI6MjA5NTM4NzMyMn0.-e6UBJjqBYUIJ7GgO4mFxYYJY2w99-0FSBDk_Vy9Tzs";

const TABLES = {
  projects: "projects",
  payments: "payments",
  recurring: "recurring_transactions",
};

const initialState = {
  projects: [],
  payments: [],
  recurring: [],
};

let state = loadLocalState();
let databaseOnline = false;

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const refs = {
  referenceMonth: $("#referenceMonth"),
  projectForm: $("#projectForm"),
  paymentForm: $("#paymentForm"),
  recurringForm: $("#recurringForm"),
  projectTable: $("#projectTable"),
  paymentTable: $("#paymentTable"),
  recurringTable: $("#recurringTable"),
  overviewProjects: $("#overviewProjects"),
  overviewRecurring: $("#overviewRecurring"),
  paymentProject: $("#paymentProject"),
  projectSearch: $("#projectSearch"),
  paymentSearch: $("#paymentSearch"),
  recurringSearch: $("#recurringSearch"),
  themeToggle: $("#themeToggle"),
  themeLabel: $("#themeLabel"),
  syncStatus: $("#syncStatus"),
};

function loadLocalState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...initialState, ...JSON.parse(saved) } : structuredClone(initialState);
  } catch {
    return structuredClone(initialState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function countStateItems(source) {
  return source.projects.length + source.payments.length + source.recurring.length;
}

function setSyncStatus(status, message) {
  refs.syncStatus.textContent = message;
  refs.syncStatus.classList.toggle("online", status === "online");
  refs.syncStatus.classList.toggle("offline", status === "offline");
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: supabaseHeaders(options.headers),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Erro ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function projectFromDatabase(project) {
  return {
    id: project.id,
    name: project.name,
    client: project.client,
    value: numberValue(project.value),
    received: numberValue(project.received),
    status: project.status,
    dueDate: project.due_date || "",
    notes: project.notes || "",
  };
}

function paymentFromDatabase(payment) {
  return {
    id: payment.id,
    description: payment.description,
    amount: numberValue(payment.amount),
    date: payment.payment_date,
    projectId: payment.project_id || "",
    method: payment.method,
  };
}

function recurringFromDatabase(item) {
  return {
    id: item.id,
    description: item.description,
    amount: numberValue(item.amount),
    day: item.due_day,
    frequency: item.frequency,
    status: item.status,
    client: item.client || "",
  };
}

function projectToDatabase(project) {
  return {
    id: project.id || createId(),
    name: project.name,
    client: project.client,
    value: project.value,
    received: project.received,
    status: project.status,
    due_date: project.dueDate || null,
    notes: project.notes || null,
  };
}

function paymentToDatabase(payment) {
  return {
    id: payment.id || createId(),
    description: payment.description,
    amount: payment.amount,
    payment_date: payment.date,
    project_id: payment.projectId || null,
    method: payment.method,
  };
}

function recurringToDatabase(item) {
  return {
    id: item.id || createId(),
    description: item.description,
    amount: item.amount,
    due_day: item.day,
    frequency: item.frequency,
    status: item.status,
    client: item.client || null,
  };
}

function fromDatabase(collection, rows) {
  const mappers = {
    projects: projectFromDatabase,
    payments: paymentFromDatabase,
    recurring: recurringFromDatabase,
  };
  return rows.map(mappers[collection]);
}

function toDatabase(collection, item) {
  const mappers = {
    projects: projectToDatabase,
    payments: paymentToDatabase,
    recurring: recurringToDatabase,
  };
  return mappers[collection](item);
}

async function loadDatabaseState() {
  const [projects, payments, recurring] = await Promise.all([
    supabaseRequest(`${TABLES.projects}?select=*&order=created_at.desc`),
    supabaseRequest(`${TABLES.payments}?select=*&order=payment_date.desc`),
    supabaseRequest(`${TABLES.recurring}?select=*&order=due_day.asc`),
  ]);

  state = {
    projects: fromDatabase("projects", projects),
    payments: fromDatabase("payments", payments),
    recurring: fromDatabase("recurring", recurring),
  };

  databaseOnline = true;
  saveState();
  setSyncStatus("online", "Dados sincronizados com Supabase");
}

async function uploadStateToDatabase(source) {
  const validProjects = source.projects.filter((project) => isUuid(project.id));
  const validProjectIds = new Set(validProjects.map((project) => project.id));
  const validPayments = source.payments
    .filter((payment) => isUuid(payment.id))
    .map((payment) => ({
      ...payment,
      projectId: validProjectIds.has(payment.projectId) ? payment.projectId : "",
    }));
  const validRecurring = source.recurring.filter((item) => isUuid(item.id));

  await Promise.all(validProjects.map((project) => {
    return supabaseRequest(TABLES.projects, {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(toDatabase("projects", project)),
    });
  }));

  await Promise.all([
    ...validPayments.map((payment) => {
      return supabaseRequest(TABLES.payments, {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(toDatabase("payments", payment)),
      });
    }),
    ...validRecurring.map((item) => {
      return supabaseRequest(TABLES.recurring, {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(toDatabase("recurring", item)),
      });
    }),
  ]);
}

function getPreferredTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  refs.themeLabel.textContent = theme === "dark" ? "Claro" : "Escuro";
  refs.themeToggle.setAttribute("aria-label", theme === "dark" ? "Alternar para modo claro" : "Alternar para modo escuro");
}

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function numberValue(value) {
  return Number.parseFloat(value || "0") || 0;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthISO() {
  return new Date().toISOString().slice(0, 7);
}

function normalizeText(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isSameMonth(date, month) {
  return String(date || "").slice(0, 7) === month;
}

function projectName(projectId) {
  if (!projectId) return "Sem projeto";
  return state.projects.find((project) => project.id === projectId)?.name || "Projeto removido";
}

function displayStatus(status) {
  const displayMap = {
    "Aguardando inicio": "Aguardando início",
    Concluido: "Concluído",
  };

  return displayMap[status] || status;
}

function displayPaymentMethod(method) {
  const displayMap = {
    Cartao: "Cartão",
    Transferencia: "Transferência",
  };

  return displayMap[method] || method;
}

function statusBadge(status) {
  const statusMap = {
    "Em desenvolvimento": "success",
    "Aguardando início": "warning",
    "Aguardando inicio": "warning",
    Pausado: "warning",
    Concluído: "success",
    Concluido: "success",
    Ativa: "success",
    Pausada: "warning",
    Cancelada: "danger",
  };

  return `<span class="badge ${statusMap[status] || ""}">${displayStatus(status)}</span>`;
}

function renderEmpty(tbody, columns = 6) {
  tbody.innerHTML = `<tr><td colspan="${columns}" class="empty-state">Nenhum registro encontrado.</td></tr>`;
}

function renderMetrics() {
  const month = refs.referenceMonth.value;
  const monthPayments = state.payments.filter((payment) => isSameMonth(payment.date, month));
  const received = monthPayments.reduce((total, payment) => total + payment.amount, 0);
  const recurringMonthly = state.recurring
    .filter((item) => item.status === "Ativa")
    .reduce((total, item) => {
      if (item.frequency === "Trimestral") return total + item.amount / 3;
      if (item.frequency === "Anual") return total + item.amount / 12;
      return total + item.amount;
    }, 0);
  const developmentProjects = state.projects.filter((project) => project.status === "Em desenvolvimento");
  const pipeline = developmentProjects.reduce((total, project) => total + Math.max(project.value - project.received, 0), 0);
  const active = state.projects.filter((project) => !["Concluído", "Concluido"].includes(project.status)).length;

  $("#metricReceived").textContent = money.format(received);
  $("#metricRecurring").textContent = money.format(recurringMonthly);
  $("#metricPipeline").textContent = money.format(pipeline);
  $("#metricActiveProjects").textContent = active;
}

function renderProjectOptions() {
  const options = ['<option value="">Sem projeto vinculado</option>'];
  state.projects
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .forEach((project) => {
      options.push(`<option value="${project.id}">${project.name} - ${project.client}</option>`);
    });

  refs.paymentProject.innerHTML = options.join("");
}

function renderProjects() {
  const term = normalizeText(refs.projectSearch.value);
  const projects = state.projects.filter((project) => {
    const haystack = normalizeText(`${project.name} ${project.client} ${project.status}`);
    return haystack.includes(term);
  });

  if (!projects.length) {
    renderEmpty(refs.projectTable, 5);
  } else {
    refs.projectTable.innerHTML = projects
      .map((project) => {
        const balance = Math.max(project.value - project.received, 0);
        return `
          <tr>
            <td>
              <strong>${project.name}</strong>
              <div class="muted">${project.dueDate ? `Entrega: ${formatDate(project.dueDate)}` : "Sem prazo definido"}</div>
            </td>
            <td>${project.client}</td>
            <td>${statusBadge(project.status)}</td>
            <td>
              <span class="money">${money.format(balance)}</span>
              <div class="muted">de ${money.format(project.value)}</div>
            </td>
            <td>
              <div class="row-actions">
                <button class="icon-button" type="button" data-edit-project="${project.id}">Editar</button>
                <button class="icon-button delete" type="button" data-delete-project="${project.id}">Excluir</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  const overview = state.projects
    .filter((project) => !["Concluído", "Concluido"].includes(project.status))
    .slice(0, 5);

  if (!overview.length) {
    renderEmpty(refs.overviewProjects, 4);
  } else {
    refs.overviewProjects.innerHTML = overview
      .map(
        (project) => `
          <tr>
            <td><strong>${project.name}</strong></td>
            <td>${project.client}</td>
            <td>${statusBadge(project.status)}</td>
            <td class="money">${money.format(project.value)}</td>
          </tr>
        `,
      )
      .join("");
  }
}

function renderPayments() {
  const term = normalizeText(refs.paymentSearch.value);
  const payments = state.payments
    .filter((payment) => {
      const haystack = normalizeText(`${payment.description} ${payment.method} ${projectName(payment.projectId)}`);
      return haystack.includes(term);
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!payments.length) {
    renderEmpty(refs.paymentTable, 5);
    return;
  }

  refs.paymentTable.innerHTML = payments
    .map(
      (payment) => `
        <tr>
          <td>
            <strong>${payment.description}</strong>
            <div class="muted">${displayPaymentMethod(payment.method)}</div>
          </td>
          <td>${formatDate(payment.date)}</td>
          <td>${projectName(payment.projectId)}</td>
          <td class="money positive">${money.format(payment.amount)}</td>
          <td>
            <div class="row-actions">
              <button class="icon-button" type="button" data-edit-payment="${payment.id}">Editar</button>
              <button class="icon-button delete" type="button" data-delete-payment="${payment.id}">Excluir</button>
            </div>
          </td>
        </tr>
      `,
    )
    .join("");
}

function renderRecurring() {
  const term = normalizeText(refs.recurringSearch.value);
  const recurring = state.recurring
    .filter((item) => {
      const haystack = normalizeText(`${item.description} ${item.client} ${item.status} ${item.frequency}`);
      return haystack.includes(term);
    })
    .sort((a, b) => a.day - b.day);

  if (!recurring.length) {
    renderEmpty(refs.recurringTable, 6);
  } else {
    refs.recurringTable.innerHTML = recurring
      .map(
        (item) => `
          <tr>
            <td>
              <strong>${item.description}</strong>
              <div class="muted">${item.frequency}</div>
            </td>
            <td>${item.client || "Sem cliente"}</td>
            <td>Dia ${item.day}</td>
            <td class="money">${money.format(item.amount)}</td>
            <td>${statusBadge(item.status)}</td>
            <td>
              <div class="row-actions">
                <button class="icon-button" type="button" data-edit-recurring="${item.id}">Editar</button>
                <button class="icon-button delete" type="button" data-delete-recurring="${item.id}">Excluir</button>
              </div>
            </td>
          </tr>
        `,
      )
      .join("");
  }

  const activeRecurring = state.recurring.filter((item) => item.status === "Ativa").slice(0, 5);
  if (!activeRecurring.length) {
    refs.overviewRecurring.innerHTML = '<div class="empty-state">Nenhuma recorrência ativa.</div>';
  } else {
    refs.overviewRecurring.innerHTML = activeRecurring
      .map(
        (item) => `
          <div class="list-item">
            <div>
              <strong>${item.description}</strong>
              <span>${item.client || "Sem cliente"} - vencimento dia ${item.day}</span>
            </div>
            <strong class="money">${money.format(item.amount)}</strong>
          </div>
        `,
      )
      .join("");
  }
}

function formatDate(date) {
  if (!date) return "-";
  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR");
}

function renderAll() {
  renderMetrics();
  renderProjectOptions();
  renderProjects();
  renderPayments();
  renderRecurring();
}

async function upsert(collection, data) {
  const record = data.id ? data : { ...data, id: createId() };

  if (databaseOnline) {
    const savedRows = await supabaseRequest(TABLES[collection], {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(toDatabase(collection, record)),
    });
    const saved = fromDatabase(collection, savedRows)[0];
    state[collection] = state[collection].some((item) => item.id === saved.id)
      ? state[collection].map((item) => (item.id === saved.id ? saved : item))
      : [saved, ...state[collection]];
  } else if (data.id) {
    state[collection] = state[collection].map((item) => (item.id === data.id ? record : item));
  } else {
    state[collection].push(record);
  }

  saveState();
  renderAll();
}

function fillForm(form, data) {
  Object.entries(data).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value ?? "";
  });
}

function resetFormTitle(form, title) {
  form.reset();
  form.elements.id.value = "";
  form.querySelector("h2").textContent = title;
}

async function handleProjectSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));

  try {
    await upsert("projects", {
      id: data.id,
      name: data.name.trim(),
      client: data.client.trim(),
      value: numberValue(data.value),
      received: numberValue(data.received),
      status: data.status,
      dueDate: data.dueDate,
      notes: data.notes.trim(),
    });

    resetFormTitle(form, "Novo projeto");
  } catch (error) {
    alert(`Não foi possível salvar o projeto. ${error.message}`);
  }
}

async function handlePaymentSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));

  try {
    await upsert("payments", {
      id: data.id,
      description: data.description.trim(),
      amount: numberValue(data.amount),
      date: data.date,
      projectId: data.projectId,
      method: data.method,
    });

    resetFormTitle(form, "Novo recebimento");
    form.elements.date.value = todayISO();
  } catch (error) {
    alert(`Não foi possível salvar o recebimento. ${error.message}`);
  }
}

async function handleRecurringSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));

  try {
    await upsert("recurring", {
      id: data.id,
      description: data.description.trim(),
      amount: numberValue(data.amount),
      day: Math.min(Math.max(Number.parseInt(data.day, 10) || 1, 1), 31),
      frequency: data.frequency,
      status: data.status,
      client: data.client.trim(),
    });

    resetFormTitle(form, "Nova recorrência");
  } catch (error) {
    alert(`Não foi possível salvar a recorrência. ${error.message}`);
  }
}

async function deleteItem(collection, id) {
  if (databaseOnline) {
    await supabaseRequest(`${TABLES[collection]}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        Prefer: "return=minimal",
      },
    });
  }

  state[collection] = state[collection].filter((item) => item.id !== id);
  saveState();
  renderAll();
}

function bindEvents() {
  $$(".nav-tab").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });

  $$("[data-go-tab]").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.goTab));
  });

  refs.projectForm.addEventListener("submit", handleProjectSubmit);
  refs.paymentForm.addEventListener("submit", handlePaymentSubmit);
  refs.recurringForm.addEventListener("submit", handleRecurringSubmit);

  refs.projectForm.addEventListener("reset", () => setTimeout(() => resetFormTitle(refs.projectForm, "Novo projeto")));
  refs.paymentForm.addEventListener("reset", () => setTimeout(() => {
    resetFormTitle(refs.paymentForm, "Novo recebimento");
    refs.paymentForm.elements.date.value = todayISO();
  }));
  refs.recurringForm.addEventListener("reset", () => setTimeout(() => resetFormTitle(refs.recurringForm, "Nova recorrência")));

  refs.projectSearch.addEventListener("input", renderProjects);
  refs.paymentSearch.addEventListener("input", renderPayments);
  refs.recurringSearch.addEventListener("input", renderRecurring);
  refs.referenceMonth.addEventListener("change", renderMetrics);
  refs.themeToggle.addEventListener("click", () => {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    applyTheme(current === "dark" ? "light" : "dark");
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const projectId = target.dataset.editProject;
    const deleteProjectId = target.dataset.deleteProject;
    const paymentId = target.dataset.editPayment;
    const deletePaymentId = target.dataset.deletePayment;
    const recurringId = target.dataset.editRecurring;
    const deleteRecurringId = target.dataset.deleteRecurring;

    if (projectId) {
      const project = state.projects.find((item) => item.id === projectId);
      if (!project) return;
      fillForm(refs.projectForm, project);
      refs.projectForm.querySelector("h2").textContent = "Editar projeto";
    }

    if (deleteProjectId && confirm("Excluir este projeto?")) {
      deleteItem("projects", deleteProjectId).catch((error) => alert(`Não foi possível excluir o projeto. ${error.message}`));
    }

    if (paymentId) {
      const payment = state.payments.find((item) => item.id === paymentId);
      if (!payment) return;
      fillForm(refs.paymentForm, payment);
      refs.paymentForm.querySelector("h2").textContent = "Editar recebimento";
    }

    if (deletePaymentId && confirm("Excluir este recebimento?")) {
      deleteItem("payments", deletePaymentId).catch((error) => alert(`Não foi possível excluir o recebimento. ${error.message}`));
    }

    if (recurringId) {
      const recurring = state.recurring.find((item) => item.id === recurringId);
      if (!recurring) return;
      fillForm(refs.recurringForm, recurring);
      refs.recurringForm.querySelector("h2").textContent = "Editar recorrência";
    }

    if (deleteRecurringId && confirm("Excluir esta recorrência?")) {
      deleteItem("recurring", deleteRecurringId).catch((error) => alert(`Não foi possível excluir a recorrência. ${error.message}`));
    }
  });

  $("#exportData").addEventListener("click", exportData);
  $("#importData").addEventListener("change", importData);
}

function activateTab(tabId) {
  $$(".nav-tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tabId));
  $$(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === tabId));
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `solairew-financeiro-${todayISO()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const imported = JSON.parse(String(reader.result));
      const importedState = {
        projects: Array.isArray(imported.projects) ? imported.projects : [],
        payments: Array.isArray(imported.payments) ? imported.payments : [],
        recurring: Array.isArray(imported.recurring) ? imported.recurring : [],
      };

      if (databaseOnline) {
        await Promise.all([
          ...importedState.projects.map((project) => upsert("projects", project)),
          ...importedState.payments.map((payment) => upsert("payments", payment)),
          ...importedState.recurring.map((item) => upsert("recurring", item)),
        ]);
        await loadDatabaseState();
      } else {
        state = importedState;
        saveState();
        renderAll();
      }
    } catch {
      alert("Não foi possível importar o arquivo.");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

async function boot() {
  applyTheme(getPreferredTheme());
  refs.referenceMonth.value = currentMonthISO();
  refs.paymentForm.elements.date.value = todayISO();
  bindEvents();
  renderAll();

  try {
    const localSnapshot = structuredClone(state);
    await loadDatabaseState();
    if (countStateItems(state) === 0 && countStateItems(localSnapshot) > 0) {
      setSyncStatus("online", "Migrando dados locais para o Supabase...");
      await uploadStateToDatabase(localSnapshot);
      await loadDatabaseState();
    }
    renderAll();
  } catch (error) {
    databaseOnline = false;
    setSyncStatus("offline", "Usando cache local. Execute o SQL do Supabase se for o primeiro acesso.");
    console.error(error);
  }
}

boot();
