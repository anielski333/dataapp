import React, { useState } from "react";
import { FilterBar } from "../shared/FilterBar.js";
import { PanelTabs, SubTabs } from "../shared/PanelTabs.js";
import { formatMoney, formatNumber, formatDateTime, formatDate } from "../../utils/format.js";
import { api } from "../../api/client.js";
import { UserRoundCog, Shield, CreditCard, Trash2, Bell, Palette, Globe } from "lucide-react";

export function SettingsView() {
  const [tab, setTab] = useState("Profil");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    await new Promise((r) => setTimeout(r, 800));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="dashboard-column">
      <div className="page-head">
        <h1>Ustawienia</h1>
        <FilterBar />
      </div>
      <PanelTabs tabs={["Profil", "Firma", "Wygląd", "Płatności", "Bezpieczeństwo"]} active={tab} onChange={setTab} />
      {tab === "Profil" && <ProfileSettings saving={saving} saved={saved} onSave={handleSave} />}
      {tab === "Firma" && <CompanySettings />}
      {tab === "Wygląd" && <AppearanceSettings />}
      {tab === "Płatności" && <BillingSettings />}
      {tab === "Bezpieczeństwo" && <SecuritySettings />}
    </div>
  );
}

function SettingsSection({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="panel" style={{marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
        {icon}
        <div>
          <h2 style={{margin:0}}>{title}</h2>
          {desc && <p style={{fontSize:12,color:"#64748b",margin:0}}>{desc}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function FormField({ label, type = "text", value, onChange, placeholder }: { label: string; type?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div style={{marginBottom:12}}>
      <label style={{display:"block",fontSize:12,fontWeight:600,color:"#374151",marginBottom:4}}>{label}</label>
      {type === "textarea" ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          style={{width:"100%",padding:"8px 12px",border:"1px solid #d1d5db",borderRadius:6,fontSize:13,minHeight:80}} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          style={{width:"100%",padding:"8px 12px",border:"1px solid #d1d5db",borderRadius:6,fontSize:13}} />
      )}
    </div>
  );
}

function ProfileSettings({ saving, saved, onSave }: { saving: boolean; saved: boolean; onSave: () => void }) {
  const [name, setName] = useState("Admin");
  const [email, setEmail] = useState("admin@anielskihub.pl");
  const [bio, setBio] = useState("");

  return (
    <>
      <SettingsSection icon={<UserRoundCog size={20} />} title="Profil użytkownika" desc="Zarządzaj swoimi danymi osobowymi">
        <FormField label="Imię i nazwisko" value={name} onChange={setName} placeholder="Twoje imię" />
        <FormField label="Email" type="email" value={email} onChange={setEmail} placeholder="email@example.com" />
        <FormField label="Bio" type="textarea" value={bio} onChange={setBio} placeholder="Krótki opis..." />
        <button className="btn-primary" onClick={onSave} disabled={saving}>
          {saving ? "Zapisywanie..." : saved ? "Zapisano! ✓" : "Zapisz zmiany"}
        </button>
      </SettingsSection>
      <SettingsSection icon={<Bell size={20} />} title="Powiadomienia" desc="Konfiguruj powiadomienia email">
        {["Raport dzienny", "Alerty sprzedażowe", "Błędy integracji", "Nowa wersja"].map((item) => (
          <label key={item} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",cursor:"pointer"}}>
            <input type="checkbox" defaultChecked style={{accentColor:"#6366f1"}} />
            <span style={{fontSize:13}}>{item}</span>
          </label>
        ))}
      </SettingsSection>
    </>
  );
}

function CompanySettings() {
  const [name, setName] = useState("Anielski Hub");
  const [vat, setVat] = useState("PL1234567890");
  const [address, setAddress] = useState("");
  const [currency, setCurrency] = useState("PLN");
  const [timezone, setTimezone] = useState("Europe/Warsaw");

  return (
    <SettingsSection icon={<Globe size={20} />} title="Ustawienia firmy" desc="Dane firmy i preferencje regionalne">
      <FormField label="Nazwa firmy" value={name} onChange={setName} />
      <FormField label="NIP/VAT" value={vat} onChange={setVat} />
      <FormField label="Adres" type="textarea" value={address} onChange={setAddress} />
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div>
          <label style={{display:"block",fontSize:12,fontWeight:600,color:"#374151",marginBottom:4}}>Waluta</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}
            style={{width:"100%",padding:"8px 12px",border:"1px solid #d1d5db",borderRadius:6,fontSize:13}}>
            <option value="PLN">PLN (zł)</option>
            <option value="EUR">EUR (€)</option>
            <option value="GBP">GBP (£)</option>
          </select>
        </div>
        <div>
          <label style={{display:"block",fontSize:12,fontWeight:600,color:"#374151",marginBottom:4}}>Strefa czasowa</label>
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)}
            style={{width:"100%",padding:"8px 12px",border:"1px solid #d1d5db",borderRadius:6,fontSize:13}}>
            <option value="Europe/Warsaw">Warszawa (UTC+1)</option>
            <option value="Europe/London">Londyn (UTC+0)</option>
            <option value="Europe/Berlin">Berlin (UTC+1)</option>
          </select>
        </div>
      </div>
      <div style={{marginTop:16}}>
        <button className="btn-primary">Zapisz ustawienia firmy</button>
      </div>
    </SettingsSection>
  );
}

function AppearanceSettings() {
  const [theme, setTheme] = useState("light");
  const [sidebar, setSidebar] = useState("expanded");

  return (
    <SettingsSection icon={<Palette size={20} />} title="Wygląd" desc="Dostosuj wygląd dashboardu">
      <div style={{marginBottom:12}}>
        <label style={{display:"block",fontSize:12,fontWeight:600,color:"#374151",marginBottom:4}}>Motyw</label>
        <div style={{display:"flex",gap:8}}>
          {[
            { value: "light", label: "Jasny" },
            { value: "dark", label: "Ciemny" },
            { value: "system", label: "Systemowy" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              style={{
                padding: "8px 16px",
                background: theme === opt.value ? "#6366f1" : "#f1f5f9",
                color: theme === opt.value ? "#fff" : "#475569",
                border: `1px solid ${theme === opt.value ? "#6366f1" : "#e2e8f0"}`,
                borderRadius: 6, cursor: "pointer", fontSize: 13,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{marginBottom:12}}>
        <label style={{display:"block",fontSize:12,fontWeight:600,color:"#374151",marginBottom:4}}>Sidebar</label>
        <div style={{display:"flex",gap:8}}>
          {[
            { value: "expanded", label: "Rozszerzony" },
            { value: "collapsed", label: "Zwinięty" },
            { value: "hidden", label: "Ukryty" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSidebar(opt.value)}
              style={{
                padding: "8px 16px",
                background: sidebar === opt.value ? "#6366f1" : "#f1f5f9",
                color: sidebar === opt.value ? "#fff" : "#475569",
                border: 
                border: `1px solid ${sidebar === opt.value ? "#6366f1" : "#e2e8f0"}`,
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </SettingsSection>
  );
}
