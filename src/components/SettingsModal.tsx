import { useState } from 'react'
import { useGame } from '@/game/GameProvider'
import { clearSave, exportSave, importSave, save } from '@/engine/save'
import { Button, Modal } from './ui'

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const game = useGame()
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [confirmingReset, setConfirmingReset] = useState(false)

  const doExport = async () => {
    const encoded = exportSave(game.state)
    setCode(encoded)
    try {
      await navigator.clipboard.writeText(encoded)
      setStatus('Save code copied to clipboard.')
    } catch {
      setStatus('Save code generated below — copy it manually.')
    }
  }

  const doImport = () => {
    const imported = importSave(code)
    if (!imported) {
      setStatus('That code could not be read. Nothing was changed.')
      return
    }
    game.replaceState(imported)
    save(imported)
    setStatus('Save loaded.')
  }

  const doReset = () => {
    clearSave()
    game.hardReset()
    setConfirmingReset(false)
    setStatus('Everything erased. Starting over for real this time.')
  }

  return (
    <Modal onClose={onClose} labelledBy="settings-title">
      <div className="p-5 sm:p-6">
        <h2 id="settings-title" className="font-display text-lg font-semibold text-white">
          Save data
        </h2>
        <p className="mt-1.5 text-sm text-white/50">
          Progress is stored in this browser and saved every few seconds.
        </p>

        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Paste a save code here to load it"
          spellCheck={false}
          rows={4}
          className="mt-4 w-full resize-none rounded-lg border border-white/10 bg-void-950/60 px-3 py-2 font-mono text-xs text-white/70 placeholder:text-white/25 focus:border-white/30 focus:outline-none"
        />

        <div className="mt-2 flex flex-wrap gap-2">
          <Button onClick={doExport}>Export</Button>
          <Button onClick={doImport} disabled={code.trim().length === 0}>
            Import
          </Button>
        </div>

        {status && <p className="mt-3 text-xs text-white/45">{status}</p>}

        <div className="mt-6 border-t border-white/8 pt-4">
          {confirmingReset ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-white/60">
                Erase every timeline permanently?
              </span>
              <Button variant="danger" onClick={doReset}>
                Yes, erase everything
              </Button>
              <Button variant="outline" onClick={() => setConfirmingReset(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setConfirmingReset(true)}>
              Erase all progress
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
