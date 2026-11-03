import type { AppInfo, LocalModelStatus, ModelInfo, Settings } from '../../../preload/index.d'
import AiPanel from '../components/AiPanel'
import CompanionPanel from '../components/CompanionPanel'
import GamesPanel from '../components/GamesPanel'
import GeneralPanel from '../components/GeneralPanel'
import ModelsPanel from '../components/ModelsPanel'
import PrivacyPanel from '../components/PrivacyPanel'
import VoicePanel from '../components/VoicePanel'
import { localModelInfo } from '../hooks/useLocalModels'
import { t } from '../i18n'

export type SettingsTab = 'general' | 'games' | 'models' | 'companion' | 'voice' | 'ai' | 'privacy'

const TABS: { id: SettingsTab; icon: string }[] = [
  { id: 'general', icon: '⚙️' },
  { id: 'games', icon: '🕹️' },
  { id: 'models', icon: '🧠' },
  { id: 'companion', icon: '🎮' },
  { id: 'voice', icon: '🎙️' },
  { id: 'ai', icon: '☁️' },
  { id: 'privacy', icon: '🔒' }
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
  const current = TABS.find((item) => item.id === tab) ?? TABS[0]
  return (
    <div className="settings">
      <nav className="settings-nav" aria-label={t('settingsScreen.settings')}>
        <button type="button" className="back-button" onClick={onClose}>
          {t('settingsScreen.backToChat')}
        </button>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item${item.id === tab ? ' is-active' : ''}`}
            aria-current={item.id === tab ? 'page' : undefined}
            onClick={() => onTab(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            {t(`settingsScreen.tabs.${item.id}`)}
          </button>
        ))}
      </nav>
      <main className="settings-content">
        <h1>{t(`settingsScreen.tabs.${current.id}`)}</h1>
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
        {tab === 'privacy' && <PrivacyPanel settings={settings} update={update} />}
      </main>
    </div>
  )
}

export default SettingsScreen
