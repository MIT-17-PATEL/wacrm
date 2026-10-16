"use client"

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { AlertTriangle } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export interface ConfirmOptions {
  title: ReactNode
  description?: ReactNode
  confirmLabel?: ReactNode
  cancelLabel?: ReactNode
  /** Red confirm button + warning icon. Defaults to true. */
  destructive?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/**
 * Promise-based confirmation dialog, styled with the design system —
 * the replacement for `window.confirm`:
 *
 *   const confirm = useConfirm()
 *   if (!(await confirm({ title: "Delete flow?" }))) return
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>")
  return ctx
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("UiPrimitives")
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const [open, setOpen] = useState(false)
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setOpen(false)
  }, [])

  const confirm = useCallback<ConfirmFn>((opts) => {
    // A second request while one is open cancels the first.
    resolver.current?.(false)
    setOptions(opts)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const destructive = options?.destructive ?? true

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={open} onOpenChange={(next) => !next && settle(false)}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader className="flex-row items-start gap-3">
            {destructive ? (
              <span className="tile-danger icon-tile size-10 rounded-xl">
                <AlertTriangle className="size-5" />
              </span>
            ) : null}
            <div className="min-w-0 space-y-1.5">
              <DialogTitle>{options?.title}</DialogTitle>
              {options?.description ? (
                <DialogDescription>{options.description}</DialogDescription>
              ) : null}
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => settle(false)}>
              {options?.cancelLabel ?? t("cancel")}
            </Button>
            <Button
              variant={destructive ? "danger" : "default"}
              onClick={() => settle(true)}
              autoFocus
            >
              {options?.confirmLabel ?? (destructive ? t("delete") : t("confirm"))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}
