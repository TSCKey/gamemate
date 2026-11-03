import { useState } from 'react'
import type { Settings } from '../../../preload/index.d'
import { LINKS } from '../constants'
import { LegalReader, type LegalDoc } from '../legal/LegalReader'
import { ExternalLink, Field, Section } from './ui'
import { Trans } from 'react-i18next'
import { t } from '../i18n'

// What GameMate does with data, in plain words. Shown on first start and in Settings → Privacy &
// legal.
export function PrivacySummary(): React.JSX.Element {
  return (
    <ul className="privacy-list">
      <li>
        <Trans i18nKey="privacyPanel.summary.runsOnYourPc" components={{ b: <strong /> }} />
      </li>
      <li>
        <Trans i18nKey="privacyPanel.summary.yourScreen" components={{ b: <strong /> }} />
      </li>
      <li>
        <Trans i18nKey="privacyPanel.summary.findingYourGames" components={{ b: <strong /> }} />
      </li>
      <li>
        <Trans i18nKey="privacyPanel.summary.yourMicrophone" components={{ b: <strong /> }} />
      </li>
      <li>
        <Trans
          i18nKey="privacyPanel.summary.chatsAndTheCompanionLog"
          components={{ b: <strong /> }}
        />
      </li>
      <li>
        <Trans
          i18nKey="privacyPanel.summary.onlineFeaturesAreOffUntil"
          components={{ b: <strong /> }}
        />
      </li>
    </ul>
  )
}

const dateOf = (iso: string | undefined): string =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'long' }) : ''

// One optional consent: whether it's given (and since when), and a way to withdraw it that is as
// easy as giving it.
function ConsentRow({
  label,
  given,
  since,
  where,
  onWithdraw
}: {
  label: string
  given: boolean
  since: string | undefined
  where: string
  onWithdraw: () => void
}): React.JSX.Element {
  return (
    <Field
      label={label}
      help={
        given
          ? since
            ? t('privacyPanel.givenOnYouCanAlso', { value: dateOf(since), where })
            : t('privacyPanel.givenYouCanAlsoChange', { where })
          : t('privacyPanel.notGivenYouCanTurn', { where })
      }
    >
      {given ? (
        <button type="button" onClick={onWithdraw}>
          {t('privacyPanel.withdraw')}
        </button>
      ) : (
        <span className="consent-off">{t('privacyPanel.off')}</span>
      )}
    </Field>
  )
}

function PrivacyPanel({
  settings,
  update
}: {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}): React.JSX.Element {
  const [confirming, setConfirming] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [reading, setReading] = useState<LegalDoc | null>(null)

  const deleteData = async (): Promise<void> => {
    await window.api.deleteData()
    setConfirming(false)
    setDeleted(true)
  }

  return (
    <>
      <Section
        title={t('privacyPanel.termsOfUseAndPrivacy')}
        description={
          settings.termsAcceptedAt
            ? t('privacyPanel.youAcceptedTheTermsOf', { value: dateOf(settings.termsAcceptedAt) })
            : undefined
        }
      >
        <div className="button-row">
          <button type="button" onClick={() => setReading('terms')}>
            {t('privacyPanel.readTheTermsOfUse')}
          </button>
          <button type="button" onClick={() => setReading('privacy')}>
            {t('privacyPanel.readThePrivacyPolicy')}
          </button>
        </div>
      </Section>

      <Section
        title={t('privacyPanel.yourConsents')}
        description={t('privacyPanel.optionalFeaturesThatSendData')}
      >
        <ConsentRow
          label={t('privacyPanel.findingYourGames')}
          given={settings.deviceConsent}
          since={settings.consents.games}
          where={t('privacyPanel.settingsGames')}
          onWithdraw={() => update({ deviceConsent: false })}
        />
        <ConsentRow
          label={t('privacyPanel.onlineLookups')}
          given={settings.webLookup}
          since={settings.consents.lookups}
          where={t('privacyPanel.settingsAiOnline')}
          onWithdraw={() => update({ webLookup: false })}
        />
        <ConsentRow
          label={t('privacyPanel.webSearchGoogle')}
          given={settings.webSearch}
          since={settings.consents.search}
          where={t('privacyPanel.settingsAiOnline')}
          onWithdraw={() => update({ webSearch: false })}
        />
        <ConsentRow
          label="Google Gemini"
          given={settings.geminiConsent}
          since={settings.consents.gemini}
          where={t('privacyPanel.settingsAiOnline')}
          onWithdraw={() => update({ geminiConsent: false })}
        />
      </Section>

      <Section title={t('privacyPanel.howGamemateHandlesYourData')}>
        <PrivacySummary />
      </Section>

      <Section
        title={t('privacyPanel.storedOnThisPc')}
        description={t('privacyPanel.onlyInYourWindowsUser')}
      >
        <ul className="privacy-list">
          <li>{t('privacyPanel.yourSettings')}</li>
          <li>{t('privacyPanel.yourGeminiApiKeyIf')}</li>
          <li>{t('privacyPanel.aiModelsGamemateSAi')}</li>
          <li>{t('privacyPanel.gamesFoundOrAddedTheir')}</li>
          <li>
            {t('privacyPanel.aLogOfWhatGamemate')}{' '}
            <button type="button" className="link-button" onClick={() => window.api.openLogs()}>
              {t('privacyPanel.openLogFolder')}
            </button>
          </li>
        </ul>
      </Section>

      <Section
        title={t('privacyPanel.whenYouUseOnlineFeatures')}
        description={t('privacyPanel.theseServicesHandleYourData')}
      >
        <ul className="privacy-list">
          <li>
            <Trans
              i18nKey="privacyPanel.geminiTerms"
              components={{
                b: <strong />,
                terms: <ExternalLink href={LINKS.geminiTerms} />,
                privacy: <ExternalLink href={LINKS.googlePrivacy} />
              }}
            />
          </li>
          <li>
            <Trans
              i18nKey="privacyPanel.wikiLicenses"
              components={{ b: <strong />, link: <ExternalLink href={LINKS.wikiDisclaimer} /> }}
            />
          </li>
        </ul>
      </Section>

      <Section
        title={t('privacyPanel.withdrawMyAcceptanceOfThe')}
        description={t('privacyPanel.gamemateStopsWorkingUntilYou')}
      >
        {withdrawing ? (
          <div className="button-row">
            <button
              type="button"
              className="danger"
              onClick={() => window.api.legal.withdraw().then(() => setWithdrawing(false))}
            >
              {t('privacyPanel.yesWithdraw')}
            </button>
            <button type="button" onClick={() => setWithdrawing(false)}>
              {t('privacyPanel.cancel')}
            </button>
          </div>
        ) : (
          <button type="button" className="danger" onClick={() => setWithdrawing(true)}>
            {t('privacyPanel.withdrawAcceptance')}
          </button>
        )}
      </Section>

      <Section
        title={t('privacyPanel.deleteMyData')}
        description={t('privacyPanel.removesEverythingAboveFromThis')}
      >
        {deleted ? (
          <p className="ok-text">{t('privacyPanel.doneEverythingGamemateStoredHas')}</p>
        ) : confirming ? (
          <div className="button-row">
            <button type="button" className="danger" onClick={deleteData}>
              {t('privacyPanel.yesDeleteEverything')}
            </button>
            <button type="button" onClick={() => setConfirming(false)}>
              {t('privacyPanel.cancel')}
            </button>
          </div>
        ) : (
          <button type="button" className="danger" onClick={() => setConfirming(true)}>
            {t('privacyPanel.deleteMyData')}
          </button>
        )}
      </Section>
      {reading && <LegalReader doc={reading} onDoc={setReading} onClose={() => setReading(null)} />}
    </>
  )
}

export default PrivacyPanel
