import type { AppInfo, ModelInfo, Settings } from '../../preload/index.d'
import AiPanel from './components/AiPanel'
import CompanionPanel from './components/CompanionPanel'
import GeneralPanel from './components/GeneralPanel'
import PrivacyPanel from './components/PrivacyPanel'
import VoicePanel from './components/VoicePanel'

export type SettingsTab = 'general' | 'companion' | 'voice' | 'ai' | 'privacy'

const TABS: { id: SettingsTab; icon: string; label: string }[] = [
  { id: 'general', icon: '⚙️', label: 'General' },
  { id: 'companion', icon: '🎮', label: 'Companion' },
  { id: 'voice', icon: '🎙️', label: 'Voice' },
  { id: 'ai', icon: '☁️', label: 'AI & online' },
  { id: 'privacy', icon: '🔒', label: 'Privacy' }
]

function SettingsScreen({
  tab,
  onTab,
  onClose,
  settings,
  update,
  models,
  modelError,
  reloadModels,
  versions,
  appInfo
}: {
  tab: SettingsTab
  onTab: (tab: SettingsTab) => void
  onClose: () => void
  settings: Settings
  update: (patch: Partial<Settings>) => void
  models: ModelInfo[]
  modelError: string | null
  reloadModels: () => void
  versions: string[]
  appInfo: AppInfo | null
}): React.JSX.Element {
  const current = TABS.find((t) => t.id === tab) ?? TABS[0]
  return (
    <div className="settings">
      <nav className="settings-nav" aria-label="Settings">
        <button type="button" className="back-button" onClick={onClose}>
          ← Back to chat
        </button>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`nav-item${t.id === tab ? ' is-active' : ''}`}
            aria-current={t.id === tab ? 'page' : undefined}
            onClick={() => onTab(t.id)}
          >
            <span className="nav-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
      <main className="settings-content">
        <h1>{current.label}</h1>
        {tab === 'general' && (
          <GeneralPanel
            settings={settings}
            update={update}
            models={models}
            modelError={modelError}
            reloadModels={reloadModels}
            versions={versions}
            appInfo={appInfo}
          />
        )}
        {tab === 'companion' && <CompanionPanel settings={settings} update={update} />}
        {tab === 'voice' && <VoicePanel settings={settings} update={update} appInfo={appInfo} />}
        {tab === 'ai' && <AiPanel settings={settings} update={update} />}
        {tab === 'privacy' && <PrivacyPanel />}
      </main>
    </div>
  )
}

export default SettingsScreen
