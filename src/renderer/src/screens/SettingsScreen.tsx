import type { AppInfo, LocalModelStatus, ModelInfo, Settings } from '../../../preload/index.d'
import AiPanel from '../components/AiPanel'
import CompanionPanel from '../components/CompanionPanel'
import GamesPanel from '../components/GamesPanel'
import GeneralPanel from '../components/GeneralPanel'
import ModelsPanel from '../components/ModelsPanel'
import PrivacyPanel from '../components/PrivacyPanel'
import VoicePanel from '../components/VoicePanel'
import { localModelInfo } from '../hooks/useLocalModels'

export type SettingsTab = 'general' | 'games' | 'models' | 'companion' | 'voice' | 'ai' | 'privacy'

const TABS: { id: SettingsTab; icon: string; label: string }[] = [
  { id: 'general', icon: '⚙️', label: 'General' },
  { id: 'games', icon: '🕹️', label: 'Games' },
  { id: 'models', icon: '🧠', label: 'Models' },
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
  localModels,
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
  localModels: LocalModelStatus[]
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
          <GeneralPanel settings={settings} update={update} appInfo={appInfo} />
        )}
        {tab === 'games' && <GamesPanel settings={settings} update={update} />}
        {tab === 'models' && (
          <ModelsPanel
            settings={settings}
            update={update}
            localModels={localModels}
            ollamaModels={models}
            ollamaError={modelError}
            reloadOllama={reloadModels}
            onOpenAi={() => onTab('ai')}
          />
        )}
        {tab === 'companion' && <CompanionPanel settings={settings} update={update} />}
        {tab === 'voice' && <VoicePanel settings={settings} update={update} appInfo={appInfo} />}
        {tab === 'ai' && (
          <AiPanel
            settings={settings}
            update={update}
            localName={localModelInfo(settings, localModels, models).name}
          />
        )}
        {tab === 'privacy' && <PrivacyPanel />}
      </main>
    </div>
  )
}

export default SettingsScreen
