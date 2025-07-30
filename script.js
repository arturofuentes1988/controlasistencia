document.addEventListener('DOMContentLoaded', () => {
    // =================================================================================
    // --- CONFIGURACIÓN & CONSTANTES ---
    // =================================================================================
    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw9I5-vOEZjkA9qYJ9-stQaJjbhrkEZE6T71oytOK-q9JMTa7hcCH5nUQY2W8FVOJk5/exec';
    const REGISTROS_POR_PAGINA = 15;
    const HORAS_SEMANALES_REQUERIDAS = 40;
    const HORAS_DIARIAS_REQUERIDAS = 8;

    // =================================================================================
    // --- ESTADO DE LA APLICACIÓN ---
    // =================================================================================
    let allData = [];
    let filteredData = [];
    let currentPage = 1;
    let config = {};
    let profiles = {};
    let charts = {};
    let activeAnalisisRange = 'week';

    // =================================================================================
    // --- FUNCIONES DE UTILIDAD ---
    // =================================================================================
    const decimalToHHMM = (d) => {
        if (isNaN(d) || d === null || d === undefined) return '00:00';
        const h = Math.floor(d);
        const m = Math.round((d - h) * 60);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const getWeekDateRange = (date) => {
        const start = new Date(date);
        const day = start.getDay();
        const diff = start.getDate() - day + (day === 0 ? -6 : 1);
        start.setDate(diff);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        return { start, end };
    };

    const updateStatus = (message, isError = false) => {
        const statusDiv = document.getElementById('data-status');
        if (statusDiv) {
            statusDiv.textContent = message;
            statusDiv.className = `px-4 py-2 rounded-md text-sm font-semibold ${isError ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`;
        }
    };

    // =================================================================================
    // --- GESTIÓN DE DATOS Y STORAGE ---
    // =================================================================================
    const loadConfigAndProfiles = () => {
        config = JSON.parse(localStorage.getItem('asistenciaConfig')) || { horaEntrada: '09:00', horaSalida: '18:00', colacionStartTime: '13:00', colacionEndTime: '14:00', tolerancia: 10 };
        profiles = JSON.parse(localStorage.getItem('asistenciaProfiles')) || {};
    };

    const saveData = () => {
        localStorage.setItem('asistenciaConfig', JSON.stringify(config));
        localStorage.setItem('asistenciaProfiles', JSON.stringify(profiles));
    };

    const fetchData = () => {
        updateStatus("Cargando datos...", false);
        fetch(SCRIPT_URL)
            .then(res => res.ok ? res.json() : Promise.reject(new Error(`Error de Red: ${res.statusText}`)))
            .then(data => {
                if (data.error) return Promise.reject(new Error(`Error en Script: ${data.error}`));
                allData = data.map(item => {
                    const profile = profiles[item.id] || {};
                    const nombreCompleto = profile.nombre ? `${profile.nombre} ${profile.apellido || ''}`.trim() : item.nombre;
                    return { ...item, timestamp: new Date(item.timestamp), nombre: nombreCompleto, fecha: new Date(item.timestamp).toLocaleDateString('sv-SE'), hora: new Date(item.timestamp).toLocaleTimeString('es-ES') };
                }).sort((a, b) => b.timestamp - a.timestamp);
                updateStatus(`Carga exitosa. ${allData.length} registros.`, false);
                initUI();
            })
            .catch(err => updateStatus(err.message, true));
    };

    // =================================================================================
    // --- MOTOR DE CÁLCULO PRINCIPAL ---
    // =================================================================================
    const calculateStatsForPeriod = (records) => {
        const stats = { totalHorasNormales: 0, totalHorasExtra: 0, totalColacion: 0, totalAtraso: 0, diasTrabajados: 0, daily: {} }; // daily is an object now
        const jornadaRequerida = (new Date(`1970-01-01T${config.horaSalida}`) - new Date(`1970-01-01T${config.horaEntrada}`)) / 3600000;
        const colacionDecimal = (new Date(`1970-01-01T${config.colacionEndTime}`) - new Date(`1970-01-01T${config.colacionStartTime}`)) / 3600000;

        const groupedByDay = records.reduce((acc, r) => {
            (acc[r.fecha] = acc[r.fecha] || []).push(r);
            return acc;
        }, {});

        stats.diasTrabajados = Object.keys(groupedByDay).length;

        Object.values(groupedByDay).forEach(dayRecords => {
            const entradas = dayRecords.filter(r => r.tipo === 'Entrada').sort((a, b) => a.timestamp - b.timestamp);
            const salidas = dayRecords.filter(r => r.tipo === 'Salida').sort((a, b) => a.timestamp - b.timestamp);
            
            let daily = { horasNormales: 0, horasExtra: 0, colacion: colacionDecimal, atraso: 0 }; // Initialize colacion here
            if (entradas.length > 0) {
                const primeraEntrada = entradas[0].timestamp;
                const horaEntradaConfig = new Date(`${dayRecords[0].fecha}T${config.horaEntrada}`);
                const horaEntradaTolerancia = new Date(horaEntradaConfig.getTime() + config.tolerancia * 60000);
                if (primeraEntrada > horaEntradaTolerancia) {
                    daily.atraso = (primeraEntrada - horaEntradaConfig) / 3600000;
                }
                if (salidas.length > 0) {
                    const ultimaSalida = salidas[salidas.length - 1].timestamp;
                    const horasTrabajadasBrutas = (ultimaSalida - primeraEntrada) / 3600000;
                    const horasTrabajadasNetas = Math.max(0, horasTrabajadasBrutas - daily.colacion);
                    daily.horasExtra = Math.max(0, horasTrabajadasNetas - jornadaRequerida);
                    daily.horasNormales = horasTrabajadasNetas - daily.horasExtra;
                }
            }
            stats.totalHorasNormales += daily.horasNormales;
            stats.totalHorasExtra += daily.horasExtra;
            stats.totalColacion += daily.colacion;
            stats.totalAtraso += daily.atraso;
            
            // Store daily stats by date string
            stats.daily[dayRecords[0].fecha] = { 
                h: daily.horasNormales + daily.horasExtra, 
                c: daily.colacion, 
                a: daily.atraso, 
                weekIndex: new Date(dayRecords[0].timestamp).getDay() 
            };
        });
        return stats;
    };

    // =================================================================================
    // --- LÓGICA DE RENDERIZADO ---
    // =================================================================================
    const renderDashboard = () => {
        const monthFilter = document.getElementById('dashboard-month-filter');
        let selectedMonth = monthFilter.value;
        if (!selectedMonth && allData.length > 0) { // Set default to current month if no selection
            selectedMonth = allData[0].fecha.substring(0, 7); // Use the latest month from data
            monthFilter.value = selectedMonth;
        } else if (!selectedMonth) { // No data at all
            document.getElementById('stats-cards').innerHTML = '<p class="col-span-5 text-center text-slate-500">No hay datos para mostrar.</p>';
            renderChart('dailyHoursChart', 'bar', { labels: [], datasets: [] });
            renderChart('recordTypeChart', 'doughnut', { labels: [], datasets: [] });
            return;
        }

        const [year, month] = selectedMonth.split('-').map(Number);
        const monthData = allData.filter(d => new Date(d.timestamp).getFullYear() === year && new Date(d.timestamp).getMonth() === month - 1);
        
        const workerData = monthData.reduce((acc, record) => {
            (acc[record.nombre] = acc[record.nombre] || []).push(record);
            return acc;
        }, {});

        const workerCount = Object.keys(workerData).length;
        if (workerCount === 0) {
            document.getElementById('stats-cards').innerHTML = '<p class="col-span-5 text-center text-slate-500">No hay datos para el mes seleccionado.</p>';
            renderChart('dailyHoursChart', 'bar', { labels: [], datasets: [] });
            renderChart('recordTypeChart', 'doughnut', { labels: [], datasets: [] });
            return;
        }

        let totalHorasNormales = 0, totalHorasExtra = 0, totalAtraso = 0, totalDiasTrabajados = 0;
        Object.values(workerData).forEach(records => {
            const stats = calculateStatsForPeriod(records);
            totalHorasNormales += stats.totalHorasNormales;
            totalHorasExtra += stats.totalHorasExtra;
            totalAtraso += stats.totalAtraso;
            totalDiasTrabajados += stats.diasTrabajados;
        });

        document.getElementById('stats-cards').innerHTML = `
            <div class="bg-white p-4 rounded-lg shadow-sm text-center"><p class="text-sm text-slate-500">Trabajadores Activos</p><p class="text-2xl font-bold text-slate-800">${workerCount}</p></div>
            <div class="bg-white p-4 rounded-lg shadow-sm text-center"><p class="text-sm text-slate-500">Días Trab. (Prom)</p><p class="text-2xl font-bold text-slate-800">${(totalDiasTrabajados / workerCount).toFixed(1)}</p></div>
            <div class="bg-white p-4 rounded-lg shadow-sm text-center"><p class="text-sm text-slate-500">Prom. Horas Normales</p><p class="text-2xl font-bold text-sky-600">${decimalToHHMM(totalHorasNormales / workerCount)}</p></div>
            <div class="bg-white p-4 rounded-lg shadow-sm text-center"><p class="text-sm text-slate-500">Prom. Horas Extra</p><p class="text-2xl font-bold text-teal-500">${decimalToHHMM(totalHorasExtra / workerCount)}</p></div>
            <div class="bg-white p-4 rounded-lg shadow-sm text-center"><p class="text-sm text-slate-500">Prom. Tiempo Atraso</p><p class="text-2xl font-bold text-red-500">${decimalToHHMM(totalAtraso / workerCount)}</p></div>
        `;
        
        const monthStats = calculateStatsForPeriod(monthData);
        const daysInMonth = new Date(year, month, 0).getDate();
        const dailyLabels = Array.from({ length: daysInMonth }, (_, i) => i + 1);
        const dailyChartData = {
            labels: dailyLabels,
            datasets: [
                { label: 'Trabajo', data: dailyLabels.map(day => monthStats.daily[new Date(year, month - 1, day).toLocaleDateString('sv-SE')]?.h || 0), backgroundColor: '#38bdf8' },
                { label: 'Colación', data: dailyLabels.map(day => monthStats.daily[new Date(year, month - 1, day).toLocaleDateString('sv-SE')]?.c || 0), backgroundColor: '#a5b4fc' },
                { label: 'Atraso', data: dailyLabels.map(day => monthStats.daily[new Date(year, month - 1, day).toLocaleDateString('sv-SE')]?.a || 0), backgroundColor: '#f87171' },
            ]
        };
        renderChart('dailyHoursChart', 'bar', dailyChartData, { scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } });

        const recordTypes = monthData.reduce((acc, r) => { acc[r.tipo] = (acc[r.tipo] || 0) + 1; return acc; }, {});
        renderChart('recordTypeChart', 'doughnut', { labels: Object.keys(recordTypes), datasets: [{ data: Object.values(recordTypes), backgroundColor: ['#22c55e', '#ef4444'] }] });
    };

    const renderRegistros = () => {
        const tbody = document.getElementById('tabla-registros');
        const paginationControls = document.getElementById('pagination-controls');
        if (!tbody || !paginationControls) return;
        const filteredData = applyFilters();
        if (filteredData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center p-8 text-slate-500">No hay registros.</td></tr>`;
            paginationControls.innerHTML = '';
            return;
        }
        const totalPages = Math.ceil(filteredData.length / REGISTROS_POR_PAGINA);
        currentPage = Math.min(currentPage, totalPages);
        const paginatedData = filteredData.slice((currentPage - 1) * REGISTROS_POR_PAGINA, currentPage * REGISTROS_POR_PAGINA);
        tbody.innerHTML = paginatedData.map(r => `<tr><td class="p-3">${r.id}</td><td class="p-3 font-semibold">${r.nombre}</td><td class="p-3">${r.fecha}</td><td class="p-3">${r.hora}</td><td class="p-3"><span class="px-2 py-1 text-xs rounded-full ${r.tipo === 'Entrada' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${r.tipo}</span></td></tr>`).join('');
        let paginationHTML = `<span class="text-sm text-slate-600">Página ${currentPage} de ${totalPages}</span><div>`;
        if (currentPage > 1) paginationHTML += `<button data-page="${currentPage - 1}" class="pagination-btn px-3 py-1 bg-white border rounded-md text-sm hover:bg-slate-50">Anterior</button>`;
        if (currentPage < totalPages) paginationHTML += `<button data-page="${currentPage + 1}" class="pagination-btn ml-2 px-3 py-1 bg-white border rounded-md text-sm hover:bg-slate-50">Siguiente</button>`;
        paginationControls.innerHTML = paginationHTML + `</div>`;
    };

    const renderAnalisis = () => {
        const selectedWorkerName = document.getElementById('analisis-trabajador')?.value;
        const statsCards = document.getElementById('analisis-stats-cards');
        if (!selectedWorkerName || !statsCards) {
            if(statsCards) statsCards.innerHTML = '<div class="col-span-3 text-center p-8 text-slate-500">Selecciona un trabajador.</div>';
            renderChart('periodHoursChart', 'bar', { labels: [], datasets: [] });
            renderChart('weeklyComplianceChart', 'bar', { labels: [], datasets: [] });
            return;
        }

        const today = new Date();
        let start, end, periodLabels, requiredHours, complianceLabel;
        if (activeAnalisisRange === 'day') {
            start = new Date(new Date().setHours(0,0,0,0));
            end = new Date(new Date().setHours(23,59,59,999));
            periodLabels = ['Hoy'];
            requiredHours = HORAS_DIARIAS_REQUERIDAS;
            complianceLabel = 'Cumplimiento Diario';
        } else if (activeAnalisisRange === 'week') {
            const week = getWeekDateRange(today);
            start = week.start; end = week.end;
            periodLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
            requiredHours = HORAS_SEMANALES_REQUERIDAS;
            complianceLabel = 'Cumplimiento Semanal';
        } else if (activeAnalisisRange === 'month') {
            start = new Date(today.getFullYear(), today.getMonth(), 1);
            end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            const daysInMonth = end.getDate();
            periodLabels = Array.from({length: daysInMonth}, (_,i)=>i+1);
            const weeksInMonth = Math.ceil(daysInMonth / 7);
            requiredHours = HORAS_SEMANALES_REQUERIDAS * weeksInMonth;
            complianceLabel = 'Cumplimiento Mensual';
        }

        const workerData = allData.filter(d => d.nombre === selectedWorkerName && d.timestamp >= start && d.timestamp <= end);
        const stats = calculateStatsForPeriod(workerData);

        statsCards.innerHTML = `
            <div class="bg-white p-4 rounded-lg shadow-sm text-center"><p class="text-sm text-slate-500">Horas Normales</p><p class="text-2xl font-bold text-sky-600">${decimalToHHMM(stats.totalHorasNormales)}</p></div>
            <div class="bg-white p-4 rounded-lg shadow-sm text-center"><p class="text-sm text-slate-500">Horas Colación</p><p class="text-2xl font-bold text-indigo-500">${decimalToHHMM(stats.totalColacion)}</p></div>
            <div class="bg-white p-4 rounded-lg shadow-sm text-center"><p class="text-sm text-slate-500">Tiempo Atraso</p><p class="text-2xl font-bold text-red-500">${decimalToHHMM(stats.totalAtraso)}</p></div>
        `;

        let dailyDataForChart = [];
        if(activeAnalisisRange === 'week') {
            // Aggregate daily stats by weekIndex (0-6) for the chart
            const weeklyAggregated = Array(7).fill(null).map(() => ({h:0, c:0, a:0}));
            Object.values(stats.daily).forEach(dayStat => {
                if (dayStat) {
                    weeklyAggregated[dayStat.weekIndex].h += dayStat.h;
                    weeklyAggregated[dayStat.weekIndex].c += dayStat.c;
                    weeklyAggregated[dayStat.weekIndex].a += dayStat.a;
                }
            });
            dailyDataForChart = weeklyAggregated;
        } else if (activeAnalisisRange === 'month') {
            // For month, stats.daily is already an object keyed by date string, need to convert to array for chart
            dailyDataForChart = periodLabels.map(day => stats.daily[new Date(start.getFullYear(), start.getMonth(), day).toLocaleDateString('sv-SE')] || {h:0, c:0, a:0});
        } else { // Day
            const todayStats = stats.daily[new Date(today.setHours(0,0,0,0)).toLocaleDateString('sv-SE')] || {h:0, c:0, a:0};
            dailyDataForChart = [todayStats];
        }

        renderChart('periodHoursChart', 'bar', { 
            labels: periodLabels,
            datasets: [
                { label: 'Trabajo', data: dailyDataForChart.map(d => d.h), backgroundColor: '#38bdf8' },
                { label: 'Colación', data: dailyDataForChart.map(d => d.c), backgroundColor: '#a5b4fc' },
                { label: 'Atraso', data: dailyDataForChart.map(d => d.a), backgroundColor: '#f87171' },
            ]
        }, { scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } });

        const totalHorasPeriodo = stats.totalHorasNormales + stats.totalHorasExtra;
        renderChart('weeklyComplianceChart', 'bar', {
            labels: [complianceLabel],
            datasets: [
                { label: 'Horas Cumplidas', data: [totalHorasPeriodo], backgroundColor: '#22c55e', barPercentage: 0.5 },
                { label: 'Horas Restantes', data: [Math.max(0, requiredHours - totalHorasPeriodo)], backgroundColor: '#e2e8f0', barPercentage: 0.5 }
            ]
        }, { indexAxis: 'y', scales: { x: { display: false, stacked: true }, y: { stacked: true } }, plugins: { legend: { display: false } } });
    };

    const renderChart = (canvasId, type, data, options = {}) => {
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) return;
        if (charts[canvasId]) charts[canvasId].destroy();
        charts[canvasId] = new Chart(ctx, { type, data, options });
    };

    // =================================================================================
    // --- MANEJADORES DE EVENTOS Y FILTROS ---
    // =================================================================================
    const setupEventListeners = () => {
        window.addEventListener('hashchange', handleNavigation);

        document.body.addEventListener('click', e => {
            const target = e.target;
            if (target.closest('.nav-link')) { e.preventDefault(); window.location.hash = target.closest('.nav-link').getAttribute('href'); }
            if (target.closest('.config-tab-btn')) { handleTabClick(target.closest('.config-tab-btn')); }
            if (target.id === 'save-config-horarios') saveHorarios();
            if (target.id === 'save-config-perfiles') savePerfiles();
            if (target.id === 'reset-filtros') resetFilters();
            if (target.matches('.pagination-btn')) { currentPage = parseInt(target.dataset.page); renderRegistros(); }
            if (target.matches('.analisis-range-btn')) {
                document.querySelectorAll('.analisis-range-btn').forEach(b => b.classList.remove('bg-sky-600', 'text-white'));
                target.classList.add('bg-sky-600', 'text-white');
                activeAnalisisRange = target.dataset.range;
                renderAnalisis();
            }
        });

        ['filtro-trabajador', 'filtro-tipo', 'filtro-fecha-inicio', 'filtro-fecha-fin', 'dashboard-month-filter'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', id === 'dashboard-month-filter' ? renderDashboard : renderRegistros);
        });
        const analisisTrabajador = document.getElementById('analisis-trabajador');
        if(analisisTrabajador) analisisTrabajador.addEventListener('change', renderAnalisis);
    };

    const handleTabClick = (tabBtn) => {
        document.querySelectorAll('.config-tab-btn').forEach(b => b.classList.remove('active', 'border-sky-500', 'text-sky-600'));
        tabBtn.classList.add('active', 'border-sky-500', 'text-sky-600');
        document.querySelectorAll('.config-tab-content').forEach(c => c.style.display = 'none');
        document.getElementById(`config-${tabBtn.dataset.tab}`).style.display = 'block';
    };

    const saveHorarios = () => {
        const newConfig = {};
        ['horaEntrada', 'horaSalida', 'colacionStartTime', 'colacionEndTime', 'tolerancia'].forEach(key => {
            const el = document.getElementById(key.replace('-', ''));
            if(el) newConfig[key] = el.type === 'number' ? parseInt(el.value) : el.value;
        });
        config = newConfig;
        saveData();
        alert('Horarios guardados.');
        fetchData();
    };

    const savePerfiles = () => {
        document.querySelectorAll('#perfiles-list input').forEach(i => { 
            const {id, field} = i.dataset; 
            if(!profiles[id]) profiles[id] = {}; 
            if (i.type === 'checkbox') {
                profiles[id][field] = i.checked;
            } else {
                profiles[id][field] = i.value; 
            }
        });
        saveData();
        alert('Perfiles guardados.');
        fetchData();
    };

    const resetFilters = () => {
        const form = document.getElementById('registros');
        form.querySelector('#filtro-trabajador').value = 'all';
        form.querySelector('#filtro-tipo').value = 'all';
        const today = new Date();
        form.querySelector('#filtro-fecha-inicio').value = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        form.querySelector('#filtro-fecha-fin').value = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
        renderRegistros();
    };

    const applyFilters = () => {
        const worker = document.getElementById('filtro-trabajador')?.value;
        const type = document.getElementById('filtro-tipo')?.value;
        const start = document.getElementById('filtro-fecha-inicio')?.value;
        const end = document.getElementById('filtro-fecha-fin')?.value;
        if(worker === undefined) return [];

        return allData.filter(d => 
            (worker === 'all' || d.nombre === worker) &&
            (type === 'all' || d.tipo === type) &&
            (!start || d.fecha >= start) &&
            (!end || d.fecha <= end)
        );
    };

    const handleNavigation = () => {
        const hash = window.location.hash || '#dashboard';
        document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        
        const activeLink = document.querySelector(`.nav-link[href="${hash}"]`);
        const activeView = document.querySelector(hash);

        if (activeLink) activeLink.classList.add('active');
        if (activeView) {
            activeView.style.display = 'block';
            if (activeView.id === 'dashboard') renderDashboard();
            if (activeView.id === 'analisis') renderAnalisis();
            if (activeView.id === 'configuracion' && !document.querySelector('.config-tab-btn.active')) {
                document.querySelector('.config-tab-btn[data-tab="horarios"]').click();
            }
        }
    };

    const populateFilters = () => {
        const workerNames = [...new Set(allData.map(item => item.nombre))].sort();
        [document.getElementById('filtro-trabajador'), document.getElementById('analisis-trabajador')].forEach(select => {
            if (!select) return;
            const currentVal = select.value;
            select.innerHTML = `<option value="all">Todos</option><option value="" disabled>-----------------</option>`;
            workerNames.forEach(w => select.innerHTML += `<option value="${w}">${w}</option>`);
            select.value = currentVal || 'all';
        });

        const monthFilter = document.getElementById('dashboard-month-filter');
        if (!monthFilter) return;
        const months = [...new Set(allData.map(d => d.fecha.substring(0, 7)))].sort().reverse();
        monthFilter.innerHTML = months.map(m => `<option value="${m}">${m}</option>`).join('');
    };

    const populateConfig = () => {
        Object.keys(config).forEach(key => { const i = document.getElementById(key.replace('-','')); if(i) i.value = config[key]; });
        const uniqueIds = [...new Set(allData.map(d => d.id))].sort((a,b) => a-b);
        const perfilesList = document.getElementById('perfiles-list');
        if(perfilesList) perfilesList.innerHTML = uniqueIds.map(id => {
            const p = profiles[id] || {};
            const originalRecord = allData.find(d => d.id === id);
            const originalName = originalRecord ? originalRecord.nombre.replace(p.apellido || '', '').trim() : '';
            return `<div class="grid grid-cols-5 gap-4 items-center border-b py-2">
                <span class="font-bold text-slate-700">ID: ${id}</span>
                <input data-id="${id}" data-field="nombre" class="p-2 border rounded-md" placeholder="Nombre" value="${p.nombre || originalName}">
                <input data-id="${id}" data-field="apellido" class="p-2 border rounded-md" placeholder="Apellido" value="${p.apellido || ''}">
                <input data-id="${id}" data-field="email" type="email" class="p-2 border rounded-md" placeholder="Correo" value="${p.email || ''}">
                <label class="flex items-center gap-2"><input data-id="${id}" data-field="horarioEspecial" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500" ${p.horarioEspecial ? 'checked' : ''}> Horario Especial</label>
            </div>`;
        }).join('');
    };

    // =================================================================================
    // --- INICIALIZACIÓN ---
    // =================================================================================
    const initUI = () => {
        setupEventListeners();
        populateFilters();
        populateConfig();
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
        document.getElementById('filtro-fecha-inicio').value = startOfMonth;
        document.getElementById('filtro-fecha-fin').value = endOfMonth;
        renderRegistros();
        handleNavigation();
        document.querySelector('.analisis-range-btn[data-range="week"]')?.classList.add('bg-sky-600', 'text-white');
    };

    const init = () => {
        loadConfigAndProfiles();
        fetchData();
    };

    init();
});