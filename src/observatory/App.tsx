import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { PropInfo } from './plugins/schemaPlugin'
import { generateProps } from './generateProps'
import { type SerializableProps, readPropsFromUrl } from './resolveProps'
import { getMarkedSequence } from './timelineTree'
import { analyzeHealth, worstSeverity } from './analyzeHealth'
import { PropsPanel } from './PropsPanel'
import { ViewportControls } from './ViewportControls'
import { TimelinePanel } from './TimelinePanel'
import { ScenarioPanel } from './ScenarioPanel'
import { PdiffModal } from './PdiffModal'
import { HealthPanel } from './HealthPanel'
import { VariantCard } from './VariantCard'
import { useTimeline } from './useTimeline'
import { useScenarios } from './useScenarios'
import { usePdiff } from './usePdiff'
import { useStress } from './useStress'
import { usePinnedVariants } from './usePinnedVariants'
import { useAI } from './useAI'
import { AIPanel } from './AIPanel'
import { MSG_PROPS, HMR_SCHEMA_UPDATE, API_SCHEMA } from './constants'
import { buildIframeSrc } from './buildIframeSrc'
import './App.css'

function writePropsToUrl(props: SerializableProps) {
  const url = new URL(window.location.href)
  url.searchParams.set('props', JSON.stringify(props))
  window.history.replaceState(null, '', url.toString())
}

function App() {
  const componentPath = new URLSearchParams(window.location.search).get(
    'component',
  )

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [propInfos, setPropInfos] = useState<PropInfo[]>([])
  const [urlProps] = useState(readPropsFromUrl)
  const hasUrlProps = Object.keys(urlProps).length > 0
  const {
    timeline,
    activeProps,
    handlePropChange,
    goToNode,
    toggleMarked,
    initTimeline,
    mergeActiveProps,
    replay,
    replaySequence,
    cancelReplay,
  } = useTimeline(urlProps)
  const {
    scenarios,
    playingScenarioId,
    addScenario,
    renameScenario,
    deleteScenario,
    selectScenario,
  } = useScenarios()
  const { pdiffRun, runPdiff, clearPdiff } = usePdiff()
  const { stressRun, runStress } = useStress()
  const { variants, pinVariant, unpinVariant } =
    usePinnedVariants(componentPath)
  const [healthCheckOpen, setHealthCheckOpen] = useState(false)
  const [autoRunHealthCheck, setAutoRunHealthCheck] = useState(false)
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [autoRunAI, setAutoRunAI] = useState(false)
  const {
    state: aiState,
    selectModel,
    analyze,
    sendMessage,
    stop: stopAI,
    clearConversation,
  } = useAI()
  const [iframeSrc, setIframeSrc] = useState<string | null>(() =>
    componentPath && hasUrlProps
      ? buildIframeSrc(componentPath, urlProps)
      : null,
  )
  const [error, setError] = useState<string | null>(null)
  const [viewportWidth, setViewportWidth] = useState<number | null>(null)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)

  useEffect(() => {
    if (!componentPath) return

    fetch(`${API_SCHEMA}?component=${encodeURIComponent(componentPath)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.props) {
          setPropInfos(data.props)
          if (!hasUrlProps) {
            const generated = generateProps(data.props)
            initTimeline(generated)
            setIframeSrc(
              (prev) => prev ?? buildIframeSrc(componentPath!, generated),
            )
          }
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
      })
  }, [componentPath, urlProps, hasUrlProps, initTimeline])

  // Re-fetch schema on HMR
  useEffect(() => {
    if (!componentPath || !import.meta.hot) return

    const path = componentPath

    function onHmr() {
      fetch(`${API_SCHEMA}?component=${encodeURIComponent(path)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.props) {
            setPropInfos(data.props)
            mergeActiveProps(generateProps(data.props))
            replay()
          }
        })
    }

    import.meta.hot.on(HMR_SCHEMA_UPDATE, onHmr)
    return () => import.meta.hot!.off(HMR_SCHEMA_UPDATE, onHmr)
  }, [componentPath, mergeActiveProps, replay])

  // Auto-run health check on changes (props or HMR-induced prop merge), debounced
  const autoRunTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!autoRunHealthCheck || !healthCheckOpen || !componentPath) return
    if (autoRunTimerRef.current) clearTimeout(autoRunTimerRef.current)
    autoRunTimerRef.current = setTimeout(() => {
      runStress(componentPath, activeProps)
    }, 500)
    return () => {
      if (autoRunTimerRef.current) clearTimeout(autoRunTimerRef.current)
    }
  }, [
    activeProps,
    autoRunHealthCheck,
    healthCheckOpen,
    componentPath,
    runStress,
  ])

  // Auto-run AI analysis on prop changes, debounced
  const autoRunAITimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!autoRunAI || !aiPanelOpen || !componentPath) return
    if (autoRunAITimerRef.current) clearTimeout(autoRunAITimerRef.current)
    autoRunAITimerRef.current = setTimeout(() => {
      analyze(componentPath, propInfos, activeProps, stressRun.result)
    }, 1000)
    return () => {
      if (autoRunAITimerRef.current) clearTimeout(autoRunAITimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProps, autoRunAI, aiPanelOpen, componentPath, propInfos, analyze])

  // Send props to the iframe whenever they change
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: MSG_PROPS, props: activeProps },
      window.location.origin,
    )
    writePropsToUrl(activeProps)
  }, [activeProps])

  const handleSaveScenario = () => {
    const steps = getMarkedSequence(timeline)
    if (steps.length === 0) return
    addScenario(`Scenario ${scenarios.length + 1}`, steps)
  }

  const playScenario = (id: string) => {
    selectScenario(id)
    const scenario = scenarios.find((s) => s.id === id)
    if (scenario) {
      replaySequence(scenario.steps.map((s) => s.id))
    }
  }

  const stepToScenario = (id: string, stepIndex: number) => {
    selectScenario(id)
    const scenario = scenarios.find((s) => s.id === id)
    if (scenario) goToNode(scenario.steps[stepIndex].id)
  }

  const handleDeleteScenario = (id: string) => {
    if (playingScenarioId === id) cancelReplay()
    if (pdiffRun?.scenarioId === id) clearPdiff()
    deleteScenario(id)
  }

  const handleRunPdiff = (scenarioId: string) => {
    const scenario = scenarios.find((s) => s.id === scenarioId)
    const iframe = iframeRef.current
    if (scenario && iframe) {
      runPdiff(scenario, iframe, () => {
        // Restore the shell's active props after the capture run
        iframe.contentWindow?.postMessage(
          { type: MSG_PROPS, props: activeProps },
          window.location.origin,
        )
      })
    }
  }

  const handleRunStress = useCallback(() => {
    if (componentPath) {
      runStress(componentPath, activeProps)
    }
  }, [componentPath, activeProps, runStress])

  const handleToggleHealthCheck = () => {
    setHealthCheckOpen((prev) => !prev)
  }

  const handleToggleAIPanel = () => {
    setAiPanelOpen((prev) => !prev)
  }

  const handleAnalyze = useCallback(() => {
    if (componentPath) {
      analyze(componentPath, propInfos, activeProps, stressRun.result)
    }
  }, [componentPath, propInfos, activeProps, stressRun.result, analyze])

  const healthCheckSeverity = useMemo(() => {
    if (!stressRun.result) return null
    return worstSeverity(analyzeHealth(stressRun.result))
  }, [stressRun.result])

  const handlePinVariant = () => {
    pinVariant(activeProps)
  }

  const playingScenario = playingScenarioId
    ? scenarios.find((s) => s.id === playingScenarioId)
    : undefined
  const playingStepIndex =
    playingScenario?.steps.findIndex((s) => s.id === timeline.activeId) ?? -1
  const scenarioPlayback =
    playingScenarioId && playingStepIndex >= 0
      ? { scenarioId: playingScenarioId, stepIndex: playingStepIndex }
      : null

  const handleViewportChange = (w: number | null, h: number | null) => {
    setViewportWidth(w)
    setViewportHeight(h)
  }

  if (!componentPath) {
    return (
      <p>
        No component specified. Run: npm run observe path/to/MyComponent.tsx
      </p>
    )
  }

  return (
    <div className="observatory">
      {error && <p className="observatory-error">{error}</p>}
      <div className="observatory-layout">
        <aside className="observatory-panel">
          {propInfos.length > 0 ? (
            <PropsPanel
              props={propInfos}
              values={activeProps}
              onChange={handlePropChange}
            />
          ) : (
            <p>Loading schema...</p>
          )}
          {timeline.nodes.length > 1 && (
            <TimelinePanel
              timeline={timeline}
              onGoToNode={goToNode}
              onToggleMarked={toggleMarked}
              onReplay={replay}
              onSaveScenario={handleSaveScenario}
            />
          )}
          <ScenarioPanel
            scenarios={scenarios}
            playback={scenarioPlayback}
            pdiffRunningId={pdiffRun?.running ? pdiffRun.scenarioId : null}
            onPlay={playScenario}
            onStepTo={stepToScenario}
            onRename={renameScenario}
            onDelete={handleDeleteScenario}
            onRunPdiff={handleRunPdiff}
          />
        </aside>
        <main className="observatory-preview">
          <ViewportControls
            width={viewportWidth}
            height={viewportHeight}
            onChange={handleViewportChange}
            onPinVariant={handlePinVariant}
            onToggleHealthCheck={handleToggleHealthCheck}
            healthCheckRunning={stressRun.running}
            healthCheckSeverity={healthCheckSeverity}
            onToggleAIPanel={handleToggleAIPanel}
            aiStreaming={aiState.streaming}
          />
          <div className="viewport-frame">
            <iframe
              ref={iframeRef}
              src={iframeSrc ?? undefined}
              title="Component preview"
              onLoad={() => {
                iframeRef.current?.contentWindow?.postMessage(
                  { type: MSG_PROPS, props: activeProps },
                  window.location.origin,
                )
              }}
              style={{
                width: viewportWidth ? `${viewportWidth}px` : '100%',
                height: viewportHeight ? `${viewportHeight}px` : '100%',
              }}
            />
          </div>
          {variants.length > 0 && (
            <div className="variant-grid">
              {variants.map((v) => (
                <VariantCard
                  key={v.id}
                  variant={v}
                  componentPath={componentPath}
                  onUnpin={unpinVariant}
                />
              ))}
            </div>
          )}
          {aiPanelOpen && (
            <AIPanel
              state={aiState}
              onClose={() => setAiPanelOpen(false)}
              onSelectModel={selectModel}
              onAnalyze={handleAnalyze}
              onSendMessage={sendMessage}
              onStop={stopAI}
              onClear={clearConversation}
              autoRun={autoRunAI}
              onAutoRunChange={setAutoRunAI}
            />
          )}
        </main>
        {healthCheckOpen && (
          <HealthPanel
            run={stressRun}
            onClose={() => setHealthCheckOpen(false)}
            onRun={handleRunStress}
            autoRun={autoRunHealthCheck}
            onAutoRunChange={setAutoRunHealthCheck}
          />
        )}
      </div>
      {pdiffRun && (
        <PdiffModal
          run={pdiffRun}
          scenarioName={
            scenarios.find((s) => s.id === pdiffRun.scenarioId)?.name ??
            'Scenario'
          }
          onClose={clearPdiff}
        />
      )}
    </div>
  )
}

export default App
