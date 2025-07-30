// =================================================================================
// --- CONFIGURACIÓN PRINCIPAL ---
// =================================================================================
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxXwaDjQwYXrHXfQNAn62fMYETEsOkBETcd30uvZbRxasEniFj4JhSOB4jGvodBtdAV/exec'; // <-- PEGA AQUÍ LA URL DE TU GOOGLE APPS SCRIPT.

// =================================================================================
// --- INICIO DE LA APLICACIÓN ---
// =================================================================================
document.addEventListener('DOMContentLoaded', function () {
    let allData = [];
    let config = { horaEntrada: '10:00', horaSalida: '19:00', duracionColacion: 0, tolerancia: 10 };
    let charts = {};
    const views = document.querySelectorAll('.view');
    const navLinks = document.querySelectorAll('.nav-link');
    const configModal = document.getElementById('config-modal');
    const statusDiv = document.getElementById('data-status');

    function updateStatus(message, isError = false) {
        if (!statusDiv) return;
        statusDiv.textContent = message;
        statusDiv.className = 'px-4 py-2 rounded-md text-sm font-semibold ';
        statusDiv.classList.add(isError ? 'bg-red-100' : 'bg-green-100', isError ? 'text-red-800' : 'text-green-800');
    }

    function fetchData() {
        const mockData = [
            {id: 201, nombre: "David Rojas (Ejemplo)", fecha: "2025-07-29", hora: "10:05:15", tipo: "Entrada"},
            {id: 201, nombre: "David Rojas (Ejemplo)", fecha: "2025-07-29", hora: "19:02:40", tipo: "Salida"},
            {id: 202, nombre: "Laura Gómez (Ejemplo)", fecha: "2025-07-29", hora: "10:12:33", tipo: "Entrada"},
            {id: 202, nombre: "Laura Gómez (Ejemplo)", fecha: "2025-07-29", hora: "18:55:01", tipo: "Salida"},
            {id: 203, nombre: "Pedro Pascal (Ejemplo)", fecha: "2025-07-29", hora: "09:58:20", tipo: "Entrada"}
        ];
        
        if (!SCRIPT_URL) {
            updateStatus("URL no configurada. Usando datos de ejemplo.", true);
            processData(mockData);
            return;
        }

        updateStatus("Cargando datos desde Google...", false);
        fetch(SCRIPT_URL)
            .then(response => {
                if (!response.ok) throw new Error(`Error de Red o Permisos: ${response.statusText} (${response.status})`);
                return response.json();
            })
            .then(data => {
                if (data.error) throw new Error(`Error en el script de Google: ${data.error}`);
                if (!Array.isArray(data)) throw new Error("Formato de datos no válido.");
                updateStatus(`Carga exitosa. ${data.length} registros encontrados.`, false);
                processData(data);
            })
            .catch(error => {
                console.error('Error al cargar datos:', error);
                updateStatus(`Error al cargar: ${error.message}. Usando datos de ejemplo.`, true);
                processData(mockData);
            });
    }
    
    function processData(data) {
        allData = data.map(d => ({...d, timestamp: new Date(`${d.fecha}T${d.hora}`)})).sort((a, b) => b.timestamp - a.timestamp);
        renderAll();
    }
    
    function calculateStats(data) {
        const groupedByDay = data.reduce((acc, record) => {
            const key = `${record.id}-${record.fecha}`;
            if (!acc[key]) { acc[key] = { id: record.id, nombre: record.nombre, fecha: record.fecha, registros: [] }; }
            acc[key].registros.push(record);
            return acc;
        }, {});
        let totalHoras = 0, totalAtrasos = 0, diasTrabajados = 0, aTiempo = 0;
        Object.values(groupedByDay).forEach(day => {
            diasTrabajados++;
            const entradas = day.registros.filter(r => r.tipo === 'Entrada').sort((a,b) => a.timestamp - b.timestamp);
            const salidas = day.registros.filter(r => r.tipo === 'Salida').sort((a,b) => a.timestamp - b.timestamp);
            if (entradas.length > 0 && salidas.length > 0) {
                const primeraEntrada = entradas[0].timestamp;
                const ultimaSalida = salidas[salidas.length - 1].timestamp;
                let horasTrabajadasDia = (ultimaSalida - primeraEntrada) / 3600000;
                let colacionMs = 0;
                if(entradas.length > 1 && salidas.length > 1) {
                    for(let i = 0; i < salidas.length - 1; i++){ colacionMs += entradas[i+1].timestamp - salidas[i].timestamp; }
                }
                horasTrabajadasDia -= colacionMs / 3600000;
                totalHoras += horasTrabajadasDia;
                const horaEntradaConfig = new Date(`${day.fecha}T${config.horaEntrada}`);
                horaEntradaConfig.setMinutes(horaEntradaConfig.getMinutes() + config.tolerancia);
                if (primeraEntrada > horaEntradaConfig) { totalAtrasos++; } else { aTiempo++; }
            }
        });
        return { totalHoras: totalHoras.toFixed(2), totalAtrasos, diasTrabajados, promedioHoras: diasTrabajados > 0 ? (totalHoras / diasTrabajados).toFixed(2) : 0, aTiempo };
    }

    function renderAll() {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentData = allData.filter(d => d.timestamp >= thirtyDaysAgo);
        populateFilters();
        renderDashboard(recentData);
        renderRegistros(allData);
        renderAnalisis(recentData);
    }
    
    function renderDashboard(data) {
        const stats = calculateStats(data);
        document.getElementById('stats-cards').innerHTML = `
            <div class="bg-white p-6 rounded-lg shadow-sm"><p class="text-sm text-slate-500">Horas Totales (30d)</p><p class="text-3xl font-bold text-slate-800">${stats.totalHoras}</p></div>
            <div class="bg-white p-6 rounded-lg shadow-sm"><p class="text-sm text-slate-500">Días Trabajados (30d)</p><p class="text-3xl font-bold text-slate-800">${stats.diasTrabajados}</p></div>
            <div class="bg-white p-6 rounded-lg shadow-sm"><p class="text-sm text-slate-500">Promedio Horas/Día</p><p class="text-3xl font-bold text-slate-800">${stats.promedioHoras}</p></div>
            <div class="bg-white p-6 rounded-lg shadow-sm"><p class="text-sm text-slate-500">Total Atrasos (30d)</p><p class="text-3xl font-bold text-red-500">${stats.totalAtrasos}</p></div>
        `;
        const horasPorEmpleado = data.reduce((acc, curr) => {
            if (!acc[curr.nombre]) acc[curr.nombre] = [];
            acc[curr.nombre].push(curr);
            return acc;
        }, {});
        const labelsHoras = Object.keys(horasPorEmpleado);
        const dataHoras = labelsHoras.map(nombre => calculateStats(horasPorEmpleado[nombre]).totalHoras);
        renderChart('horasChart', 'bar', labelsHoras, dataHoras, 'Horas Trabajadas');
        renderChart('atrasosChart', 'doughnut', ['A Tiempo', 'Con Atraso'], [stats.aTiempo, stats.totalAtrasos], '', ['#22c55e', '#ef4444']);
    }

    function renderRegistros(data) {
        const tbody = document.getElementById('tabla-registros');
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-8 text-slate-500">No hay registros para mostrar.</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(r => `<tr class="border-b border-slate-200 hover:bg-slate-50"><td class="p-3">${r.id}</td><td class="p-3 font-semibold">${r.nombre}</td><td class="p-3">${r.fecha}</td><td class="p-3">${r.hora}</td><td class="p-3"><span class="px-2 py-1 text-xs rounded-full ${r.tipo === 'Entrada' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${r.tipo}</span></td></tr>`).join('');
    }

    function renderAnalisis(data) {
        const selectedWorker = document.getElementById('analisis-trabajador').value;
        if (!selectedWorker) {
            document.getElementById('analisis-stats-cards').innerHTML = '<div class="col-span-4 text-center p-8 text-slate-500">Selecciona un trabajador para ver sus estadísticas.</div>';
            renderChart('analisisHorasChart', 'line', [], [], 'Horas Trabajadas');
            return;
        };
        const workerData = data.filter(d => d.nombre === selectedWorker);
        const stats = calculateStats(workerData);
        document.getElementById('analisis-stats-cards').innerHTML = `
            <div class="bg-white p-6 rounded-lg shadow-sm"><p class="text-sm text-slate-500">Horas Totales</p><p class="text-3xl font-bold text-slate-800">${stats.totalHoras}</p></div>
            <div class="bg-white p-6 rounded-lg shadow-sm"><p class="text-sm text-slate-500">Días Trabajados</p><p class="text-3xl font-bold text-slate-800">${stats.diasTrabajados}</p></div>
            <div class="bg-white p-6 rounded-lg shadow-sm"><p class="text-sm text-slate-500">Promedio Horas/Día</p><p class="text-3xl font-bold text-slate-800">${stats.promedioHoras}</p></div>
            <div class="bg-white p-6 rounded-lg shadow-sm"><p class="text-sm text-slate-500">Total Atrasos</p><p class="text-3xl font-bold text-red-500">${stats.totalAtrasos}</p></div>
        `;
        const groupedByDay = workerData.reduce((acc, record) => {
            if (!acc[record.fecha]) acc[record.fecha] = [];
            acc[record.fecha].push(record);
            return acc;
        }, {});
        const labels = Object.keys(groupedByDay).sort();
        const chartData = labels.map(fecha => calculateStats(groupedByDay[fecha]).totalHoras);
        renderChart('analisisHorasChart', 'line', labels, chartData, 'Horas Trabajadas');
    }
    
    function renderChart(canvasId, type, labels, data, label, backgroundColors = ['#38bdf8']) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        if (charts[canvasId]) { charts[canvasId].destroy(); }
        charts[canvasId] = new Chart(ctx, { type: type, data: { labels: labels, datasets: [{ label: label, data: data, backgroundColor: backgroundColors, borderColor: type === 'line' ? '#0284c7' : backgroundColors, borderWidth: type === 'line' ? 2 : 1, tension: 0.1, fill: false }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: type !== 'bar' && type !== 'line' } }, scales: {  y: { display: type !== 'doughnut', beginAtZero: true }, x: { display: type !== 'doughnut' } } } });
    }

    function populateFilters() {
        const workers = [...new Set(allData.map(item => item.nombre))].sort();
        const workerFilters = [document.getElementById('filtro-trabajador'), document.getElementById('analisis-trabajador')];
        workerFilters.forEach(filter => {
            const currentValue = filter.value;
            filter.innerHTML = `<option value="">Todos los trabajadores</option>`;
            workers.forEach(worker => { filter.innerHTML += `<option value="${worker}">${worker}</option>`; });
            filter.value = currentValue;
        });
        if (workers.length > 0 && !document.getElementById('analisis-trabajador').value) { document.getElementById('analisis-trabajador').value = workers[0]; }
    }

    function applyFilters() {
        const worker = document.getElementById('filtro-trabajador').value;
        const start = document.getElementById('filtro-fecha-inicio').value;
        const end = document.getElementById('filtro-fecha-fin').value;
        let filteredData = allData;
        if (worker) { filteredData = filteredData.filter(d => d.nombre === worker); }
        if (start) { filteredData = filteredData.filter(d => d.fecha >= start); }
        if (end) { filteredData = filteredData.filter(d => d.fecha <= end); }
        renderRegistros(filteredData);
    }

    function handleNavigation() {
        const hash = window.location.hash || '#dashboard';
        views.forEach(view => view.classList.toggle('active', `#${view.id}` === hash));
        navLinks.forEach(link => link.classList.toggle('active', link.getAttribute('href') === hash));
    }

    function setupEventListeners() {
        window.addEventListener('hashchange', handleNavigation);
        document.getElementById('filtro-trabajador').addEventListener('change', applyFilters);
        document.getElementById('filtro-fecha-inicio').addEventListener('change', applyFilters);
        document.getElementById('filtro-fecha-fin').addEventListener('change', applyFilters);
        document.getElementById('reset-filtros').addEventListener('click', () => { document.getElementById('filtro-trabajador').value = ''; document.getElementById('filtro-fecha-inicio').value = ''; document.getElementById('filtro-fecha-fin').value = ''; applyFilters(); });
        document.getElementById('analisis-trabajador').addEventListener('change', () => {
            const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            renderAnalisis(allData.filter(d => d.timestamp >= thirtyDaysAgo));
        });
        document.getElementById('config-link').addEventListener('click', () => configModal.classList.remove('hidden'));
        document.getElementById('cancel-config').addEventListener('click', () => configModal.classList.add('hidden'));
        document.getElementById('save-config').addEventListener('click', saveConfig);
    }

    function saveConfig() {
        config.horaEntrada = document.getElementById('hora-entrada').value;
        config.horaSalida = document.getElementById('hora-salida').value;
        config.duracionColacion = parseInt(document.getElementById('duracion-colacion').value) || 0;
        config.tolerancia = parseInt(document.getElementById('tolerancia').value) || 0;
        localStorage.setItem('asistenciaConfig', JSON.stringify(config));
        configModal.classList.add('hidden');
        renderAll();
    }

    function loadConfig() {
        const savedConfig = localStorage.getItem('asistenciaConfig');
        if (savedConfig) { config = JSON.parse(savedConfig); }
        document.getElementById('hora-entrada').value = config.horaEntrada;
        document.getElementById('hora-salida').value = config.horaSalida;
        document.getElementById('duracion-colacion').value = config.duracionColacion;
        document.getElementById('tolerancia').value = config.tolerancia;
    }

    init();
});