"use client";
import { useState, useEffect, useCallback } from "react";
import {
  getEntities, addEntity, removeEntity,
  getStatutoryForMonth, getTasksForMonth, addTask,
  updateTaskStatus, deleteTask, generatePosterText,
  getAllInstagramPosts, addInstagramPost, addWeeklyCheckin,
  deleteInstagramPost, getInstagramPostsForDate,
} from "./calendarStore";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const URGENCY_COLOR = { high: "#ef4444", medium: "#f59e0b", low: "#22c55e" };
const STATUS_COLOR = { pending: "#6b7280", "on-hold": "#f59e0b", complete: "#22c55e" };

function pad(n) { return String(n).padStart(2,"0"); }
function toDateStr(y,m,d) { return `${y}-${pad(m)}-${pad(d)}`; }

export default function CalendarView() {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1);
  const [entities, setEntities] = useState([]);
  const [filterEntity, setFilterEntity] = useState("All");
  const [filterUrgency, setFilterUrgency] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [selectedDate, setSelectedDate] = useState(null);
  const [calItems, setCalItems] = useState([]);
  const [userTasks, setUserTasks] = useState([]);
  const [igPosts, setIgPosts] = useState([]);
  const [showPoster, setShowPoster] = useState(false);
  const [posterText, setPosterText] = useState("");
  const [posterCopied, setPosterCopied] = useState(false);
  const [showAddEntity, setShowAddEntity] = useState(false);
  const [newEntityName, setNewEntityName] = useState("");
  const [quickDate, setQuickDate] = useState(today.toISOString().split("T")[0]);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickDesc, setQuickDesc] = useState("");
  const [quickEntity, setQuickEntity] = useState("GRA");
  const [quickUrgency, setQuickUrgency] = useState("medium");
  const [quickSaved, setQuickSaved] = useState(false);
  const [detailTab, setDetailTab] = useState("tasks");
  const [igForm, setIgForm] = useState({ caption:"", postUrl:"", platform:"Instagram", complianceRef:"" });
  const [igShowForm, setIgShowForm] = useState(false);
  const [checkinForm, setCheckinForm] = useState({ postId:"", likes:"", comments:"", shares:"", reach:"", notes:"", date:"" });
  const [showCheckinFor, setShowCheckinFor] = useState(null);

  const reload = useCallback(() => {
    setEntities(getEntities());
    const statutory = getStatutoryForMonth(viewYear, viewMonth);
    const user = getTasksForMonth(viewYear, viewMonth).filter(t => !t.statutoryId);
    setCalItems(statutory);
    setUserTasks(user);
    const allIg = getAllInstagramPosts();
    const prefix = `${viewYear}-${pad(viewMonth)}`;
    setIgPosts(allIg.filter(p => p.calendarDate.startsWith(prefix)));
  }, [viewYear, viewMonth]);

  useEffect(() => { reload(); }, [reload]);

  const prevMonth = () => {
    if (viewMonth === 1) { setViewYear(y => y-1); setViewMonth(12); }
    else setViewMonth(m => m-1);
  };
  const nextMonth = () => {
    if (viewMonth === 12) { setViewYear(y => y+1); setViewMonth(1); }
    else setViewMonth(m => m+1);
  };
  const goToday = () => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()+1); };

  /* Build calendar grid */
  const firstDay = new Date(viewYear, viewMonth-1, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const cells = [];
  for (let i=0; i<firstDay; i++) cells.push(null);
  for (let d=1; d<=daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  function getItemsForDay(day) {
    if (!day) return [];
    const ds = toDateStr(viewYear, viewMonth, day);
    const st = calItems.filter(c => c.date === ds);
    const ut = userTasks.filter(t => t.date === ds);
    const ig = igPosts.filter(p => p.calendarDate === ds);
    let all = [...st, ...ut, ...ig.map(p => ({ ...p, _isIg: true, label: "IG: " + (p.caption.slice(0,20) || p.platform), urgency: "low" }))];
    if (filterEntity !== "All") all = all.filter(i => (i.entity || "GRA") === filterEntity || i._isIg);
    if (filterUrgency !== "All") all = all.filter(i => i.urgency === filterUrgency.toLowerCase());
    if (filterStatus !== "All") all = all.filter(i => (i.status || "pending") === filterStatus.toLowerCase().replace(" ","-"));
    return all;
  }

  function handleDayClick(day) {
    if (!day) return;
    setSelectedDate(toDateStr(viewYear, viewMonth, day));
    setDetailTab("tasks");
  }

  const selectedStatutory = selectedDate ? calItems.filter(c => c.date === selectedDate) : [];
  const selectedUser = selectedDate ? userTasks.filter(t => t.date === selectedDate) : [];
  const selectedIg = selectedDate ? igPosts.filter(p => p.calendarDate === selectedDate) : [];

  function handleStatusChange(item, newStatus) {
    updateTaskStatus(
      item.isStatutory ? item.id : (item.overrideId || item.id),
      newStatus,
      item.date,
      item.isStatutory && !item.overrideId
    );
    reload();
  }

  function handleDeleteTask(taskId) {
    deleteTask(taskId);
    reload();
  }

  function handleQuickSave(e) {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    addTask({ date: quickDate, title: quickTitle, description: quickDesc, entity: quickEntity, urgency: quickUrgency });
    setQuickTitle(""); setQuickDesc(""); setQuickSaved(true);
    setTimeout(() => setQuickSaved(false), 1800);
    reload();
  }

  function handleAddEntity(e) {
    e.preventDefault();
    if (!newEntityName.trim()) return;
    const updated = addEntity(newEntityName.trim());
    setEntities(updated);
    setNewEntityName("");
    setShowAddEntity(false);
  }

  function handleRemoveEntity(name) {
    if (["GRA","The Blue Circle","Shriram Consultation House"].includes(name)) return;
    const updated = removeEntity(name);
    setEntities(updated);
    if (filterEntity === name) setFilterEntity("All");
    if (quickEntity === name) setQuickEntity("GRA");
  }

  function handlePoster() {
    setPosterText(generatePosterText(viewYear, viewMonth));
    setShowPoster(true);
    setPosterCopied(false);
  }

  function handleCopyPoster() {
    navigator.clipboard.writeText(posterText).then(() => {
      setPosterCopied(true);
      setTimeout(() => setPosterCopied(false), 2000);
    });
  }

  function handleAddIgPost(e) {
    e.preventDefault();
    if (!selectedDate) return;
    addInstagramPost({ ...igForm, calendarDate: selectedDate });
    setIgForm({ caption:"", postUrl:"", platform:"Instagram", complianceRef:"" });
    setIgShowForm(false);
    reload();
  }

  function handleCheckinSubmit(e) {
    e.preventDefault();
    addWeeklyCheckin(checkinForm.postId, {
      date: checkinForm.date || new Date().toISOString().split("T")[0],
      likes: checkinForm.likes, comments: checkinForm.comments,
      shares: checkinForm.shares, reach: checkinForm.reach, notes: checkinForm.notes,
    });
    setShowCheckinFor(null);
    setCheckinForm({ postId:"", likes:"", comments:"", shares:"", reach:"", notes:"", date:"" });
    reload();
  }

  const isToday = (day) => {
    if (!day) return false;
    return day === today.getDate() && viewMonth === today.getMonth()+1 && viewYear === today.getFullYear();
  };

  return (
    <div className="calendarPage">
      {/* Header */}
      <div className="calendarHeader">
        <div className="calendarHeaderLeft">
          <h2 className="calendarTitle">Compliance Calendar</h2>
          <span className="calendarMonthTag">{MONTH_NAMES[viewMonth-1]} {viewYear}</span>
        </div>
        <div className="calendarHeaderRight">
          <button className="calBtn calBtnGhost" onClick={goToday}>Today</button>
          <button className="calBtn calBtnGhost" onClick={prevMonth}>&#8249;</button>
          <button className="calBtn calBtnGhost" onClick={nextMonth}>&#8250;</button>
          <button className="calBtn calBtnPrimary" onClick={handlePoster}>Generate Poster</button>
        </div>
      </div>

      {/* Quick Entry Bar */}
      <form className="calQuickEntry" onSubmit={handleQuickSave}>
        <div className="calQuickLabel">Quick Add</div>
        <input type="date" className="calQuickInput calQuickDate" value={quickDate} onChange={e => setQuickDate(e.target.value)} required />
        <input type="text" className="calQuickInput calQuickTitle" placeholder="Task title..." value={quickTitle} onChange={e => setQuickTitle(e.target.value)} required />
        <select className="calQuickInput" value={quickEntity} onChange={e => setQuickEntity(e.target.value)}>
          {entities.map(en => <option key={en} value={en}>{en}</option>)}
        </select>
        <select className="calQuickInput" value={quickUrgency} onChange={e => setQuickUrgency(e.target.value)}>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button type="submit" className="calBtn calBtnPrimary">{quickSaved ? "Saved!" : "Save to Calendar"}</button>
      </form>

      {/* Filters */}
      <div className="calFilters">
        <div className="calFilterGroup">
          <span className="calFilterLabel">Entity</span>
          <button className={`calFilterBtn${filterEntity==="All"?" active":""}`} onClick={()=>setFilterEntity("All")}>All</button>
          {entities.map(en => (
            <button key={en} className={`calFilterBtn${filterEntity===en?" active":""}`} onClick={()=>setFilterEntity(en)}>
              {en}
              {!["GRA","The Blue Circle","Shriram Consultation House"].includes(en) && (
                <span className="calFilterRemove" onClick={e=>{e.stopPropagation();handleRemoveEntity(en);}}>x</span>
              )}
            </button>
          ))}
          <button className="calFilterBtn calFilterAdd" onClick={()=>setShowAddEntity(true)}>+ Add</button>
        </div>
        <div className="calFilterGroup">
          <span className="calFilterLabel">Urgency</span>
          {["All","High","Medium","Low"].map(u => (
            <button key={u} className={`calFilterBtn${filterUrgency===u?" active":""}`} style={u!=="All"?{borderColor:URGENCY_COLOR[u.toLowerCase()]}:{}} onClick={()=>setFilterUrgency(u)}>{u}</button>
          ))}
        </div>
        <div className="calFilterGroup">
          <span className="calFilterLabel">Status</span>
          {["All","Pending","On-hold","Complete"].map(s => (
            <button key={s} className={`calFilterBtn${filterStatus===s?" active":""}`} onClick={()=>setFilterStatus(s)}>{s}</button>
          ))}
        </div>
      </div>

      {/* Add Entity Modal */}
      {showAddEntity && (
        <div className="calModal" onClick={()=>setShowAddEntity(false)}>
          <div className="calModalCard" onClick={e=>e.stopPropagation()}>
            <div className="calModalTitle">Add Entity</div>
            <form onSubmit={handleAddEntity} className="calModalForm">
              <input type="text" placeholder="Entity name..." value={newEntityName} onChange={e=>setNewEntityName(e.target.value)} className="calModalInput" autoFocus />
              <div className="calModalActions">
                <button type="button" className="calBtn calBtnGhost" onClick={()=>setShowAddEntity(false)}>Cancel</button>
                <button type="submit" className="calBtn calBtnPrimary">Add</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Calendar Grid */}
      <div className="calGrid">
        {DAY_NAMES.map(d => <div key={d} className="calDayName">{d}</div>)}
        {cells.map((day, idx) => {
          const items = getItemsForDay(day);
          const dateStr = day ? toDateStr(viewYear, viewMonth, day) : null;
          const isSelected = dateStr === selectedDate;
          const todayClass = isToday(day) ? " calCellToday" : "";
          const selectedClass = isSelected ? " calCellSelected" : "";
          return (
            <div
              key={idx}
              className={`calCell${!day?" calCellEmpty":""}${todayClass}${selectedClass}`}
              onClick={()=>handleDayClick(day)}
            >
              {day && (
                <>
                  <span className="calCellDay">{day}</span>
                  <div className="calCellItems">
                    {items.slice(0,3).map((item,i) => (
                      <div
                        key={item.id || i}
                        className="calCellPill"
                        style={{ borderLeft: `3px solid ${URGENCY_COLOR[item.urgency] || "#6b7280"}`, opacity: item.status === "complete" ? 0.5 : 1 }}
                        title={item.label || item.title}
                      >
                        <span className="calPillStatus" style={{ background: STATUS_COLOR[item.status||"pending"] }} />
                        {(item.label || item.title || "").slice(0,18)}
                      </div>
                    ))}
                    {items.length > 3 && <div className="calCellMore">+{items.length-3} more</div>}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Date Detail Drawer */}
      {selectedDate && (
        <div className="calDrawer">
          <div className="calDrawerHeader">
            <div>
              <span className="calDrawerDate">{selectedDate}</span>
              <span className="calDrawerCount">{selectedStatutory.length + selectedUser.length + selectedIg.length} items</span>
            </div>
            <button className="calDrawerClose" onClick={()=>setSelectedDate(null)}>Close x</button>
          </div>
          <div className="calDrawerTabs">
            <button className={`calDrawerTab${detailTab==="tasks"?" active":""}`} onClick={()=>setDetailTab("tasks")}>Compliance & Tasks ({selectedStatutory.length + selectedUser.length})</button>
            <button className={`calDrawerTab${detailTab==="social"?" active":""}`} onClick={()=>setDetailTab("social")}>Social Posts ({selectedIg.length})</button>
          </div>

          {detailTab === "tasks" && (
            <div className="calDrawerContent">
              {selectedStatutory.length === 0 && selectedUser.length === 0 && (
                <div className="calDrawerEmpty">No tasks for this date.</div>
              )}
              {selectedStatutory.map(item => (
                <div key={item.id} className="calDrawerItem calDrawerStatutory">
                  <div className="calDrawerItemHeader">
                    <span className="calDrawerBadge" style={{ background: URGENCY_COLOR[item.urgency] }}>{item.category}</span>
                    <span className="calDrawerBadgeStatutory">Statutory</span>
                    <span className="calDrawerTitle">{item.label}</span>
                  </div>
                  <div className="calDrawerDesc">{item.description}</div>
                  <div className="calDrawerStatusRow">
                    {["pending","on-hold","complete"].map(s => (
                      <button
                        key={s}
                        className={`calStatusBtn${(item.status||"pending")===s?" calStatusActive":""}`}
                        style={(item.status||"pending")===s?{background:STATUS_COLOR[s],color:"#fff"}:{}}
                        onClick={()=>handleStatusChange(item, s)}
                      >
                        {s === "on-hold" ? "On Hold" : s.charAt(0).toUpperCase()+s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {selectedUser.map(item => (
                <div key={item.id} className="calDrawerItem">
                  <div className="calDrawerItemHeader">
                    <span className="calDrawerBadge" style={{ background: URGENCY_COLOR[item.urgency] }}>{item.urgency}</span>
                    <span className="calDrawerBadgeEntity">{item.entity}</span>
                    <span className="calDrawerTitle">{item.title}</span>
                    <button className="calDrawerDelete" onClick={()=>handleDeleteTask(item.id)} title="Delete task">x</button>
                  </div>
                  {item.description && <div className="calDrawerDesc">{item.description}</div>}
                  <div className="calDrawerStatusRow">
                    {["pending","on-hold","complete"].map(s => (
                      <button
                        key={s}
                        className={`calStatusBtn${(item.status||"pending")===s?" calStatusActive":""}`}
                        style={(item.status||"pending")===s?{background:STATUS_COLOR[s],color:"#fff"}:{}}
                        onClick={()=>handleStatusChange(item, s)}
                      >
                        {s === "on-hold" ? "On Hold" : s.charAt(0).toUpperCase()+s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {detailTab === "social" && (
            <div className="calDrawerContent">
              <button className="calBtn calBtnPrimary calBtnSm" onClick={()=>setIgShowForm(f=>!f)} style={{marginBottom:"12px"}}>
                {igShowForm ? "Cancel" : "+ Log Social Post"}
              </button>
              {igShowForm && (
                <form className="calIgForm" onSubmit={handleAddIgPost}>
                  <select className="calModalInput" value={igForm.platform} onChange={e=>setIgForm(f=>({...f,platform:e.target.value}))}>
                    <option>Instagram</option><option>Facebook</option><option>LinkedIn</option><option>WhatsApp</option>
                  </select>
                  <input className="calModalInput" placeholder="Caption (optional)" value={igForm.caption} onChange={e=>setIgForm(f=>({...f,caption:e.target.value}))} />
                  <input className="calModalInput" placeholder="Post URL (optional)" value={igForm.postUrl} onChange={e=>setIgForm(f=>({...f,postUrl:e.target.value}))} />
                  <input className="calModalInput" placeholder="Compliance reference e.g. GSTR-1" value={igForm.complianceRef} onChange={e=>setIgForm(f=>({...f,complianceRef:e.target.value}))} />
                  <button type="submit" className="calBtn calBtnPrimary">Save Post</button>
                </form>
              )}
              {selectedIg.length === 0 && !igShowForm && <div className="calDrawerEmpty">No social posts logged for this date.</div>}
              {selectedIg.map(post => (
                <div key={post.id} className="calIgCard">
                  <div className="calIgCardHeader">
                    <span className="calIgPlatform">{post.platform}</span>
                    {post.complianceRef && <span className="calIgRef">{post.complianceRef}</span>}
                    <button className="calDrawerDelete" onClick={()=>{deleteInstagramPost(post.id);reload();}}>x</button>
                  </div>
                  {post.caption && <div className="calIgCaption">{post.caption}</div>}
                  {post.postUrl && <a className="calIgUrl" href={post.postUrl} target="_blank" rel="noreferrer">{post.postUrl.slice(0,40)}...</a>}
                  <div className="calIgCheckins">
                    <div className="calIgCheckinsLabel">Weekly Performance Logs</div>
                    {post.weeklyCheckins.length === 0 && <div className="calDrawerEmpty">No checkins yet. Add one below.</div>}
                    {post.weeklyCheckins.map(c => (
                      <div key={c.id} className="calCheckinRow">
                        <span className="calCheckinDate">{c.date}</span>
                        <span className="calCheckinStat"><span>Likes</span> <b>{c.likes}</b></span>
                        <span className="calCheckinStat"><span>Comments</span> <b>{c.comments}</b></span>
                        <span className="calCheckinStat"><span>Shares</span> <b>{c.shares}</b></span>
                        <span className="calCheckinStat"><span>Reach</span> <b>{c.reach}</b></span>
                        {c.notes && <span className="calCheckinNotes">{c.notes}</span>}
                      </div>
                    ))}
                    {showCheckinFor === post.id ? (
                      <form className="calCheckinForm" onSubmit={handleCheckinSubmit}>
                        <input type="date" className="calCheckinInput" value={checkinForm.date} onChange={e=>setCheckinForm(f=>({...f,date:e.target.value,postId:post.id}))} />
                        <input type="number" min="0" className="calCheckinInput" placeholder="Likes" value={checkinForm.likes} onChange={e=>setCheckinForm(f=>({...f,likes:e.target.value,postId:post.id}))} />
                        <input type="number" min="0" className="calCheckinInput" placeholder="Comments" value={checkinForm.comments} onChange={e=>setCheckinForm(f=>({...f,comments:e.target.value,postId:post.id}))} />
                        <input type="number" min="0" className="calCheckinInput" placeholder="Shares" value={checkinForm.shares} onChange={e=>setCheckinForm(f=>({...f,shares:e.target.value,postId:post.id}))} />
                        <input type="number" min="0" className="calCheckinInput" placeholder="Reach" value={checkinForm.reach} onChange={e=>setCheckinForm(f=>({...f,reach:e.target.value,postId:post.id}))} />
                        <input type="text" className="calCheckinInput calCheckinInputFull" placeholder="Notes" value={checkinForm.notes} onChange={e=>setCheckinForm(f=>({...f,notes:e.target.value,postId:post.id}))} />
                        <div className="calModalActions">
                          <button type="button" className="calBtn calBtnGhost calBtnSm" onClick={()=>setShowCheckinFor(null)}>Cancel</button>
                          <button type="submit" className="calBtn calBtnPrimary calBtnSm">Save</button>
                        </div>
                      </form>
                    ) : (
                      <button className="calBtn calBtnGhost calBtnSm" onClick={()=>{setShowCheckinFor(post.id);setCheckinForm(f=>({...f,postId:post.id}));}}>+ Log This Week Stats</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Poster Modal */}
      {showPoster && (
        <div className="calModal" onClick={()=>setShowPoster(false)}>
          <div className="calModalCard calModalLarge" onClick={e=>e.stopPropagation()}>
            <div className="calModalTitle">Compliance Poster - {MONTH_NAMES[viewMonth-1]} {viewYear}</div>
            <textarea className="calPosterText" readOnly value={posterText} rows={20} />
            <div className="calModalActions">
              <button className="calBtn calBtnGhost" onClick={()=>setShowPoster(false)}>Close</button>
              <button className="calBtn calBtnPrimary" onClick={handleCopyPoster}>{posterCopied ? "Copied!" : "Copy Text"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
