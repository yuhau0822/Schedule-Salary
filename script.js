// ==========================================
// ★ スプレッドシート連携用 URL
// ==========================================
const GAS_URL = "https://script.google.com/macros/s/AKfycbx_AosX1aTrF9HCU3sCq2fgtGb9YpTXs0_7s_XZwy5q0mImwUZgptAz8wqG-rAgQMaPFQ/exec"; // ここにGoogle Apps ScriptのWebアプリURLを貼り付けます

let schedules = JSON.parse(localStorage.getItem('adv_schedules')) || [];
let categories = JSON.parse(localStorage.getItem('adv_categories')) || [
    { id: 1, name: '大学', color: '#0A2947' },
    { id: 2, name: 'サークル', color: '#D3D4C0' },
    { id: 3, name: 'プライベート', color: '#999999' }
];
let jobs = JSON.parse(localStorage.getItem('adv_jobs')) || [
    { id: 1, name: 'カフェ', wage: 1100, nightWage: 1375, transport: 500 }
];

// データ修復
const fixIds = (arr) => {
    let changed = false;
    let seenIds = new Set();
    arr.forEach((item, index) => {
        if (!item.id || item.id === 'null' || item.id === 'undefined' || item.id === 'NaN' || seenIds.has(item.id)) {
            item.id = Date.now() + index + Math.random(); 
            changed = true;
        }
        seenIds.add(item.id);
    });
    return changed;
};
if (fixIds(schedules)) localStorage.setItem('adv_schedules', JSON.stringify(schedules));
if (fixIds(categories)) localStorage.setItem('adv_categories', JSON.stringify(categories));
if (fixIds(jobs)) localStorage.setItem('adv_jobs', JSON.stringify(jobs));

// ==========================================
// ★ スプレッドシートからのデータ保存・読み込み
// ==========================================
async function loadDataFromGAS() {
    if (!GAS_URL) return; // URL未設定ならローカルデータを使う
    try {
        const res = await fetch(GAS_URL);
        const data = await res.json();
        if (data && data.schedules) {
            schedules = data.schedules || [];
            categories = data.categories || [];
            jobs = data.jobs || [];
            
            // ローカルにもバックアップ
            localStorage.setItem('adv_schedules', JSON.stringify(schedules));
            localStorage.setItem('adv_categories', JSON.stringify(categories));
            localStorage.setItem('adv_jobs', JSON.stringify(jobs));
            
            init(); // データを取得したら再描画
        }
    } catch (e) {
        console.log("GASからの読み込みに失敗、ローカルデータを使用します", e);
    }
}

function saveData() {
    // 常にローカルストレージへは即時保存（オフライン対策）
    localStorage.setItem('adv_schedules', JSON.stringify(schedules));
    localStorage.setItem('adv_categories', JSON.stringify(categories));
    localStorage.setItem('adv_jobs', JSON.stringify(jobs));

    // GAS URLがあれば非同期で送信
    if (GAS_URL) {
        fetch(GAS_URL, {
            method: 'POST',
            mode: 'no-cors', // CORSエラー回避
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ schedules, categories, jobs })
        }).catch(e => console.log("GASへの保存エラー:", e));
    }
}


let currentDate = new Date();
let selectedDateGlobal = new Date().toISOString().split('T')[0]; 
let editingId = null; 
let holidays = {}; 
let isCopyMode = false;
let copySourceData = null; 
let multiSelectedDates = []; 

async function fetchHolidays() {
    try {
        const response = await fetch('https://holidays-jp.github.io/api/v1/date.json');
        holidays = await response.json();
    } catch (e) { console.log("祝日データの取得に失敗しました"); }
    renderCalendar();
}

function init() {
    updateCategorySelect();
    renderCategoriesSettings();
    renderJobsSettings();
    fetchHolidays();
    selectDate(selectedDateGlobal);
}

function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    document.getElementById('monthYear').innerText = `${year}. ${String(month + 1).padStart(2, '0')}`;
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const calendarDays = document.getElementById('calendarDays');
    calendarDays.innerHTML = ''; 
    const today = new Date();

    for (let i = 0; i < firstDay; i++) {
        calendarDays.innerHTML += `<div class="day" style="background-color: transparent; pointer-events: none;"></div>`;
    }

    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        
        let classNames = ['day'];
        if (year === today.getFullYear() && month === today.getMonth() && i === today.getDate()) classNames.push('today');
        if (isCopyMode && multiSelectedDates.includes(dateStr)) classNames.push('multi-selected');
        
        let dayOfWeek = new Date(year, month, i).getDay();
        let numClass = 'normal';
        if (dayOfWeek === 0) numClass = 'sunday';
        if (dayOfWeek === 6) numClass = 'saturday';
        if (holidays[dateStr]) numClass = 'holiday';
        
        const dayEvents = schedules.filter(s => s.date === dateStr);
        let eventHtml = '';
        dayEvents.sort((a, b) => a.time.localeCompare(b.time)).forEach(event => {
            const cat = categories.find(c => c.name === event.category);
            const color = cat ? cat.color : '#0A2947';
            eventHtml += `<div class="event-label" style="background-color: ${color};" onclick="event.stopPropagation(); selectDate('${dateStr}');">${event.time} ${event.title}</div>`;
        });

        calendarDays.innerHTML += `
            <div class="${classNames.join(' ')}" onclick="handleDayClick('${dateStr}')">
                <div class="day-number ${numClass}">${i}</div>
                <div class="events-container">${eventHtml}</div>
            </div>
        `;
    }
    calculateSalaries();
    updateCopyBannerText();
}

function prevMonth() { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); }
function nextMonth() { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); }

function handleDayClick(dateStr) {
    if (isCopyMode) {
        if (multiSelectedDates.includes(dateStr)) {
            multiSelectedDates = multiSelectedDates.filter(d => d !== dateStr); 
        } else {
            multiSelectedDates.push(dateStr); 
            multiSelectedDates.sort();
        }
        renderCalendar(); 
    } else {
        selectDate(dateStr);
        openScheduleModal(dateStr);
    }
}

function updateCopyBannerText() {
    if(!isCopyMode) return;
    const textElem = document.getElementById('copyModeText');
    textElem.innerText = `ペーストしたい日付を選択してください (選択中: ${multiSelectedDates.length}日)`;
}

function selectDate(dateStr) {
    if (isCopyMode) return;
    selectedDateGlobal = dateStr;
    document.getElementById('selectedDateText').innerText = `${dateStr} の予定`;
    
    const dayEvents = schedules.filter(s => s.date === dateStr);
    const list = document.getElementById('dayEventList');
    list.innerHTML = '';

    if (dayEvents.length === 0) {
        list.innerHTML = '<li>予定はありません</li>';
        return;
    }

    dayEvents.sort((a, b) => a.time.localeCompare(b.time)).forEach(event => {
        const cat = categories.find(c => c.name === event.category);
        const color = cat ? cat.color : '#0A2947';
        let timeDisplay = event.time;
        if (event.endTime) timeDisplay += ` - ${event.endTime}`;
        let salaryHtml = '';
        const job = jobs.find(j => j.name === event.category);
        if (job && event.endTime) {
            const dailyPay = Math.round(calculateDailySalary(job, event.time, event.endTime));
            salaryHtml = `<span class="event-salary">予定給与: ¥${dailyPay.toLocaleString()}</span>`;
        }

        list.innerHTML += `
            <li style="border-left-color: ${color};">
                <div class="event-info">
                    <span class="event-time">${timeDisplay}</span>
                    <span class="event-title-text">${event.title} [${event.category}]</span>
                    ${salaryHtml}
                </div>
                <div class="btn-group">
                    <div class="btn-row">
                        <button class="action-btn" onclick="editSchedule('${event.id}')">編集</button>
                        <button class="action-btn" onclick="startCopyMode('${event.id}')">コピー</button>
                    </div>
                    <button class="action-btn" style="color:red; border-color:red;" onclick="deleteSchedule('${event.id}')">削除</button>
                </div>
            </li>
        `;
    });
}

function openScheduleModal(dateStr = null) {
    if (isCopyMode) return;
    editingId = null;
    document.getElementById('formTitle').innerText = '予定を追加';
    document.getElementById('submitBtn').innerText = '予定を登録';
    document.getElementById('singleDateInputArea').style.display = 'block';
    document.getElementById('multiDateDisplayArea').style.display = 'none';
    document.getElementById('dateInput').value = dateStr || selectedDateGlobal;
    document.getElementById('timeInput').value = '';
    document.getElementById('endTimeInput').value = '';
    document.getElementById('titleInput').value = '';
    document.getElementById('scheduleModal').style.display = 'flex';
}

function closeScheduleModal() { document.getElementById('scheduleModal').style.display = 'none'; }

function startCopyMode(id) {
    const schedule = schedules.find(s => String(s.id) === String(id));
    if (!schedule) return;
    isCopyMode = true;
    copySourceData = { ...schedule };
    multiSelectedDates = []; 
    document.getElementById('copyModeBanner').style.display = 'flex';
    document.getElementById('scheduleModal').style.display = 'none'; 
    renderCalendar();
}

function cancelCopyMode() {
    isCopyMode = false;
    copySourceData = null;
    multiSelectedDates = [];
    document.getElementById('copyModeBanner').style.display = 'none';
    renderCalendar();
}

function openMultiCopyModal() {
    if(multiSelectedDates.length === 0) return alert("日付が選択されていません。");
    document.getElementById('formTitle').innerText = '複数日に予定をコピー';
    document.getElementById('submitBtn').innerText = `選択した ${multiSelectedDates.length} 日に一括登録`;
    document.getElementById('singleDateInputArea').style.display = 'none';
    document.getElementById('multiDateDisplayArea').style.display = 'block';
    document.getElementById('timeInput').value = copySourceData.time;
    document.getElementById('endTimeInput').value = copySourceData.endTime || '';
    document.getElementById('titleInput').value = copySourceData.title;
    document.getElementById('categoryInput').value = copySourceData.category;
    const list = document.getElementById('selectedDatesList');
    list.innerHTML = '';
    multiSelectedDates.forEach(date => { list.innerHTML += `<span class="date-tag" onclick="removeMultiDate('${date}')">${date} ×</span>`; });
    document.getElementById('scheduleModal').style.display = 'flex';
}

function removeMultiDate(date) {
    multiSelectedDates = multiSelectedDates.filter(d => d !== date);
    if(multiSelectedDates.length === 0) document.getElementById('scheduleModal').style.display = 'none';
    else openMultiCopyModal();
    renderCalendar();
}

function addOrUpdateSchedule() {
    const time = document.getElementById('timeInput').value;
    const endTime = document.getElementById('endTimeInput').value;
    const title = document.getElementById('titleInput').value;
    const category = document.getElementById('categoryInput').value;

    if (!time || !title) return alert("時刻とタイトルを入力してください");

    if (isCopyMode) {
        multiSelectedDates.forEach(dateStr => {
            schedules.push({ id: Date.now() + Math.random(), date: dateStr, time, endTime, title, category });
        });
        cancelCopyMode(); 
    } else {
        const date = document.getElementById('dateInput').value;
        if (!date) return;
        if (editingId) {
            const index = schedules.findIndex(s => String(s.id) === String(editingId));
            if(index !== -1) schedules[index] = { id: editingId, date, time, endTime, title, category };
        } else {
            schedules.push({ id: Date.now() + Math.random(), date, time, endTime, title, category });
        }
        selectDate(date); 
    }
    saveData();
    closeScheduleModal();
    renderCalendar();
}

function editSchedule(id) {
    if (isCopyMode) return;
    const schedule = schedules.find(s => String(s.id) === String(id));
    if(schedule) {
        document.getElementById('singleDateInputArea').style.display = 'block';
        document.getElementById('multiDateDisplayArea').style.display = 'none';
        document.getElementById('dateInput').value = schedule.date;
        document.getElementById('timeInput').value = schedule.time;
        document.getElementById('endTimeInput').value = schedule.endTime || '';
        document.getElementById('titleInput').value = schedule.title;
        document.getElementById('categoryInput').value = schedule.category;
        editingId = schedule.id;
        document.getElementById('formTitle').innerText = '予定を編集';
        document.getElementById('submitBtn').innerText = '予定を更新';
        document.getElementById('scheduleModal').style.display = 'flex';
    }
}

function deleteSchedule(id) {
    if (isCopyMode) return;
    schedules = schedules.filter(s => String(s.id) !== String(id));
    saveData();
    renderCalendar();
    selectDate(selectedDateGlobal);
}

function calculateDailySalary(job, startTimeStr, endTimeStr) {
    if (!startTimeStr || !endTimeStr) return 0;
    const start = new Date(`2000-01-01T${startTimeStr}`);
    const end = new Date(`2000-01-01T${endTimeStr}`);
    if (end <= start) end.setDate(end.getDate() + 1); 
    const nightStart = new Date(`2000-01-01T22:00:00`);
    const nightEnd = new Date(`2000-01-02T05:00:00`);
    let normalMin = 0, nightMin = 0;
    let current = new Date(start);
    while (current < end) {
        const timeOfDay = new Date(`2000-01-0${current.getDate()}T${String(current.getHours()).padStart(2,'0')}:${String(current.getMinutes()).padStart(2,'0')}:00`);
        if ((timeOfDay >= nightStart && timeOfDay <= new Date(`2000-01-01T23:59:59`)) || (timeOfDay >= new Date(`2000-01-02T00:00:00`) && timeOfDay < nightEnd)) {
            nightMin++;
        } else {
            normalMin++;
        }
        current.setMinutes(current.getMinutes() + 1);
    }
    return (normalMin / 60) * job.wage + (nightMin / 60) * job.nightWage + job.transport;
}

// ==========================================
// ★ 給与計算ロジック (交通費除外対応)
// ==========================================
function calculateSalaries() {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const monthPrefix = `${year}-${month}`;
    const yearPrefix = `${year}`;
    
    let monthly = 0;
    let annual = 0;
    let annualWithoutTransport = 0; // 交通費抜きの累計
    let jobMonthlyBreakdown = {}; 

    schedules.forEach(s => {
        if (s.endTime) {
            const job = jobs.find(j => j.name === s.category);
            if (job) {
                const pay = calculateDailySalary(job, s.time, s.endTime);
                const transport = job.transport || 0; // 交通費
                
                if (s.date.startsWith(yearPrefix)) {
                    annual += pay;
                    // 交通費を引いた金額を加算
                    annualWithoutTransport += (pay - transport);
                    
                    if (s.date.startsWith(monthPrefix)) {
                        monthly += pay;
                        if (!jobMonthlyBreakdown[job.name]) jobMonthlyBreakdown[job.name] = 0;
                        jobMonthlyBreakdown[job.name] += pay;
                    }
                }
            }
        }
    });
    
    // ★ 扶養枠の計算は「交通費抜き」の金額から算出
    let remaining = 1500000 - annualWithoutTransport;
    
    document.getElementById('monthlySalary').innerText = Math.round(monthly).toLocaleString();
    document.getElementById('annualSalary').innerText = Math.round(annual).toLocaleString();
    document.getElementById('remainingSalary').innerText = Math.round(Math.max(0, remaining)).toLocaleString();

    const breakdownEl = document.getElementById('jobSalaryBreakdown');
    if (breakdownEl) {
        breakdownEl.innerHTML = '';
        if (Object.keys(jobMonthlyBreakdown).length > 0) {
            for (const [jobName, amount] of Object.entries(jobMonthlyBreakdown)) {
                breakdownEl.innerHTML += `<li><span>${jobName}</span><span>¥${Math.round(amount).toLocaleString()}</span></li>`;
            }
        }
    }
}

// 設定周りの処理
function toggleSettingsModal() { 
    const modal = document.getElementById('settingsModal'); 
    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex'; 
}

function updateCategorySelect() { 
    const select = document.getElementById('categoryInput'); 
    select.innerHTML = ''; 
    categories.forEach(c => { select.innerHTML += `<option value="${c.name}">${c.name}</option>`; }); 
}

function renderCategoriesSettings() {
    const list = document.getElementById('categoryList'); 
    list.innerHTML = '';
    categories.forEach(c => {
        list.innerHTML += `<li>
            <span><span style="color:${c.color}; font-weight:bold;">●</span> ${c.name}</span>
            <div class="btn-row">
                <button type="button" onclick="editCategory('${c.id}')" class="action-btn">編集</button>
                <button type="button" onclick="deleteCategory('${c.id}')" class="action-btn" style="color:red; border-color:red;">削除</button>
            </div>
        </li>`;
    });
    updateCategorySelect();
}

function addOrUpdateCategory() {
    const idStr = document.getElementById('editCategoryId').value; 
    const name = document.getElementById('newCategoryName').value; 
    const color = document.getElementById('newCategoryColor').value;
    if(!name) return alert("カテゴリ名を入力してください");
    if(idStr !== "") {
        const index = categories.findIndex(c => String(c.id) === idStr);
        if(index !== -1) { 
            const oldName = categories[index].name; 
            if(oldName !== name) { 
                schedules.forEach(s => { if(s.category === oldName) s.category = name; }); 
            } 
            categories[index] = { id: idStr, name: name, color: color }; 
        }
    } else { 
        categories.push({ id: Date.now() + Math.random(), name: name, color: color }); 
    }
    saveData(); 
    cancelCategoryEdit(); 
    renderCategoriesSettings(); 
    renderCalendar(); 
    selectDate(selectedDateGlobal); 
}

function editCategory(id) { 
    const cat = categories.find(c => String(c.id) === String(id)); 
    if(cat) { 
        document.getElementById('editCategoryId').value = cat.id; 
        document.getElementById('newCategoryName').value = cat.name; 
        document.getElementById('newCategoryColor').value = cat.color; 
        document.getElementById('catSubmitBtn').innerText = '更新'; 
        document.getElementById('catCancelBtn').style.display = 'inline-block'; 
    } 
}

function cancelCategoryEdit() { 
    document.getElementById('editCategoryId').value = ''; 
    document.getElementById('newCategoryName').value = ''; 
    document.getElementById('newCategoryColor').value = '#0A2947'; 
    document.getElementById('catSubmitBtn').innerText = '追加'; 
    document.getElementById('catCancelBtn').style.display = 'none'; 
}

function deleteCategory(id) { 
    categories = categories.filter(c => String(c.id) !== String(id)); 
    saveData(); 
    renderCategoriesSettings(); 
    renderCalendar(); 
}

function renderJobsSettings() {
    const list = document.getElementById('jobList'); 
    list.innerHTML = '';
    jobs.forEach(j => { 
        list.innerHTML += `<li style="display:flex; flex-direction:column; align-items:flex-start;">
            <div style="width:100%; display:flex; justify-content:space-between;">
                <b>${j.name}</b>
                <div class="btn-row">
                    <button type="button" onclick="editJob('${j.id}')" class="action-btn">編集</button>
                    <button type="button" onclick="deleteJob('${j.id}')" class="action-btn" style="color:red; border-color:red;">削除</button>
                </div>
            </div>
            <span style="font-size:0.85em; color:#8B5E3C;">基本:¥${j.wage} / 深夜:¥${j.nightWage} / 交通費:¥${j.transport}</span>
        </li>`; 
    });
}

function addOrUpdateJob() {
    const idStr = document.getElementById('editJobId').value; 
    const name = document.getElementById('newJobName').value; 
    const wage = parseFloat(document.getElementById('newJobWage').value) || 0; 
    const nightWage = parseFloat(document.getElementById('newJobNightWage').value) || wage * 1.25; 
    const transport = parseFloat(document.getElementById('newJobTransport').value) || 0;
    
    if(!name || wage <= 0) return alert("バイト名と基本時給を正しく入力してください");
    
    if(idStr !== "") { 
        const index = jobs.findIndex(j => String(j.id) === idStr); 
        if(index !== -1) jobs[index] = { id: idStr, name: name, wage: wage, nightWage: nightWage, transport: transport }; 
    } else { 
        if(!categories.find(c => c.name === name)) { 
            categories.push({ id: Date.now() + Math.random(), name: name, color: '#8B5E3C' }); 
            renderCategoriesSettings(); 
        } 
        jobs.push({ id: Date.now() + Math.random(), name: name, wage: wage, nightWage: nightWage, transport: transport }); 
    }
    saveData(); 
    cancelJobEdit(); 
    renderJobsSettings(); 
    calculateSalaries(); 
    selectDate(selectedDateGlobal); 
}

function editJob(id) { 
    const job = jobs.find(j => String(j.id) === String(id)); 
    if(job) { 
        document.getElementById('editJobId').value = job.id; 
        document.getElementById('newJobName').value = job.name; 
        document.getElementById('newJobWage').value = job.wage; 
        document.getElementById('newJobNightWage').value = job.nightWage; 
        document.getElementById('newJobTransport').value = job.transport; 
        document.getElementById('jobSubmitBtn').innerText = '更新'; 
        document.getElementById('jobCancelBtn').style.display = 'inline-block'; 
    } 
}
function cancelJobEdit() { 
    document.getElementById('editJobId').value = ''; 
    document.getElementById('newJobName').value = ''; 
    document.getElementById('newJobWage').value = ''; 
    document.getElementById('newJobNightWage').value = ''; 
    document.getElementById('newJobTransport').value = ''; 
    document.getElementById('jobSubmitBtn').innerText = '追加'; 
    document.getElementById('jobCancelBtn').style.display = 'none'; 
}
function deleteJob(id) { 
    jobs = jobs.filter(j => String(j.id) !== String(id)); 
    saveData(); 
    renderJobsSettings(); 
    calculateSalaries(); 
    selectDate(selectedDateGlobal);
}

// 起動時、GASからデータを読み込む
loadDataFromGAS().then(() => {
    init(); // 読み込み完了後に初期化（未設定の場合はすぐ初期化されます）
});
