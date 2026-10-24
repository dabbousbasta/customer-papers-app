import { useMemo, useRef, useState } from 'react'
import {
  createPricingAccount,
  createPricingInvoice
} from './lib/pricing'
import {
  cleanDocumentNumber,
  getSearchTokens,
  matchesSearch,
  normalizeSearchText
} from './lib/searchText'

// تقسيم أرقام الفواتير: سطر جديد، فاصلة، مسافة، أو Tab
function parseInvoiceNumbers(text) {
  const seen = new Set()
  const numbers = []

  for (const part of String(text || '').split(/[\n\r,،;؛\t ]+/)) {
    const number = cleanDocumentNumber(part)

    if (number && !seen.has(number)) {
      seen.add(number)
      numbers.push(number)
    }
  }

  return numbers
}

// لصق من Excel: العمود الأول اسم الحساب، وباقي الأعمدة أرقام فواتير.
// إذا كانت خانة الحساب فاضية نكمل على الحساب اللي فوق.
function parseExcelText(text) {
  const entries = new Map()
  const skipped = []
  let lastName = ''

  String(text || '')
    .split(/\r?\n/)
    .forEach((line, index) => {
      if (!line.trim()) return

      const cells = line.split('\t')

      if (cells.length < 2) {
        skipped.push(index + 1)
        return
      }

      const name =
        cells[0].trim().replace(/\s+/g, ' ') || lastName

      if (!name) {
        skipped.push(index + 1)
        return
      }

      lastName = name

      const numbers = parseInvoiceNumbers(cells.slice(1).join('\n'))
      const key = normalizeSearchText(name)

      if (!entries.has(key)) {
        entries.set(key, { name, numbers: [] })
      }

      const entry = entries.get(key)

      for (const number of numbers) {
        if (!entry.numbers.includes(number)) entry.numbers.push(number)
      }
    })

  return { entries: [...entries.values()], skipped }
}

function useLookups(accounts, invoices) {
  return useMemo(() => {
    const accountByName = new Map(
      accounts.map((account) => [
        normalizeSearchText(account.name),
        account
      ])
    )
    const invoicesByAccount = new Map()

    for (const invoice of invoices) {
      if (!invoicesByAccount.has(invoice.account_id)) {
        invoicesByAccount.set(invoice.account_id, [])
      }

      invoicesByAccount.get(invoice.account_id).push(invoice)
    }

    return { accountByName, invoicesByAccount }
  }, [accounts, invoices])
}

function getNumberStatus(account, number, invoicesByAccount) {
  if (!account) return 'new'

  const existing = (invoicesByAccount.get(account.id) || []).find(
    (invoice) => invoice.invoice_number === number
  )

  if (!existing) return 'new'

  return existing.is_archived ? 'archived' : 'exists'
}

const STATUS_LABEL = {
  new: 'جديدة',
  exists: 'مسجلة من قبل',
  archived: 'بالأرشيف'
}

// =====================================================

export default function RegisterModal({
  initialAccountId,
  accounts,
  invoices,
  imagesByInvoice,
  onAccountSaved,
  onInvoiceSaved,
  onClose
}) {
  const [mode, setMode] = useState('single')
  const [saving, setSaving] = useState(false)
  const lookups = useLookups(accounts, invoices)

  // الحفظ المشترك: ينشئ الحساب إذا مش موجود، وبعدين الفواتير الجديدة
  async function saveEntries(entries, onProgress) {
    const accountByName = new Map(lookups.accountByName)
    const known = new Set(
      invoices.map(
        (invoice) => `${invoice.account_id}|${invoice.invoice_number}`
      )
    )
    const result = {
      newAccounts: 0,
      newInvoices: 0,
      skipped: 0,
      errors: []
    }
    const total = entries.reduce(
      (sum, entry) => sum + 1 + entry.numbers.length,
      0
    )
    let done = 0

    for (const entry of entries) {
      const key = normalizeSearchText(entry.name)
      let account = accountByName.get(key)

      if (!account) {
        try {
          account = await createPricingAccount(entry.name)
          accountByName.set(key, account)
          onAccountSaved(account)
          result.newAccounts += 1
        } catch (error) {
          result.errors.push(`${entry.name}: ${error.message}`)
          done += 1 + entry.numbers.length
          onProgress?.(done, total)
          continue
        }
      }

      done += 1
      onProgress?.(done, total)

      for (const number of entry.numbers) {
        if (known.has(`${account.id}|${number}`)) {
          result.skipped += 1
        } else {
          try {
            const invoice = await createPricingInvoice({
              accountId: account.id,
              invoiceNumber: number
            })
            known.add(`${account.id}|${number}`)
            onInvoiceSaved(invoice)
            result.newInvoices += 1
          } catch (error) {
            result.errors.push(
              `${entry.name} / ${number}: ${error.message}`
            )
          }
        }

        done += 1
        onProgress?.(done, total)
      }
    }

    return result
  }

  function requestClose() {
    if (saving) return
    onClose()
  }

  return (
    <div
      className="pr-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose()
      }}
    >
      <div className="pr-modal pr-register" role="dialog" aria-modal="true">
        <div className="pr-modal-head">
          <h2>تسجيل حسابات وفواتير</h2>
          <button
            type="button"
            className="pr-icon-button pr-muted"
            onClick={requestClose}
            aria-label="إغلاق"
          >
            ×
          </button>
        </div>

        <div className="pr-mini-tabs">
          <button
            type="button"
            className={mode === 'single' ? 'active' : ''}
            onClick={() => !saving && setMode('single')}
          >
            حساب حساب
          </button>
          <button
            type="button"
            className={mode === 'excel' ? 'active' : ''}
            onClick={() => !saving && setMode('excel')}
          >
            لصق من Excel
          </button>
        </div>

        {mode === 'single' ? (
          <SingleEntry
            initialAccountId={initialAccountId}
            accounts={accounts}
            lookups={lookups}
            imagesByInvoice={imagesByInvoice}
            saving={saving}
            setSaving={setSaving}
            saveEntries={saveEntries}
            onClose={requestClose}
          />
        ) : (
          <ExcelEntry
            lookups={lookups}
            saving={saving}
            setSaving={setSaving}
            saveEntries={saveEntries}
            onClose={requestClose}
          />
        )}
      </div>
    </div>
  )
}

// =====================================================
// حساب حساب: بحث بقائمة منسدلة + أرقام الفواتير
// =====================================================

function SingleEntry({
  initialAccountId,
  accounts,
  lookups,
  imagesByInvoice,
  saving,
  setSaving,
  saveEntries,
  onClose
}) {
  const initialAccount = accounts.find(
    (account) => account.id === initialAccountId
  )
  const [accountText, setAccountText] = useState(
    initialAccount?.name || ''
  )
  const [selectedId, setSelectedId] = useState(
    initialAccount?.id || null
  )
  const [numbersText, setNumbersText] = useState('')
  const [message, setMessage] = useState(null)
  const accountInputRef = useRef(null)
  const numbersInputRef = useRef(null)

  const selectedAccount =
    accounts.find((account) => account.id === selectedId) ||
    lookups.accountByName.get(normalizeSearchText(accountText)) ||
    null
  const cleanName = accountText.trim().replace(/\s+/g, ' ')
  const isNewAccount = Boolean(cleanName) && !selectedAccount
  const numbers = parseInvoiceNumbers(numbersText)
  const accountInvoices = selectedAccount
    ? (lookups.invoicesByAccount.get(selectedAccount.id) || [])
        .slice()
        .sort((a, b) =>
          String(b.invoice_number).localeCompare(
            String(a.invoice_number),
            'en',
            { numeric: true }
          )
        )
    : []
  const newNumbers = numbers.filter(
    (number) =>
      getNumberStatus(
        selectedAccount,
        number,
        lookups.invoicesByAccount
      ) === 'new'
  )
  const canSave =
    !saving &&
    Boolean(cleanName) &&
    (isNewAccount || newNumbers.length > 0)

  async function handleSave() {
    if (!canSave) return

    setSaving(true)
    setMessage(null)

    const result = await saveEntries([
      {
        name: selectedAccount ? selectedAccount.name : cleanName,
        numbers
      }
    ])

    setSaving(false)

    const parts = []

    if (result.newAccounts) parts.push('حساب جديد')
    if (result.newInvoices) parts.push(`${result.newInvoices} فاتورة`)
    if (result.skipped) parts.push(`${result.skipped} مسجلة من قبل`)

    if (result.errors.length) {
      setMessage({
        error: true,
        text: `صار خطأ: ${result.errors.join(' — ')}`
      })
      return
    }

    setMessage({
      error: false,
      text: `انحفظ لـ «${selectedAccount ? selectedAccount.name : cleanName}»: ${parts.join('، ') || 'لا شي جديد'}. بتلاقيها بتبويب «بانتظار الصور».`
    })
    setAccountText('')
    setSelectedId(null)
    setNumbersText('')
    accountInputRef.current?.focus()
  }

  return (
    <div className="pr-step">
      <AccountCombobox
        inputRef={accountInputRef}
        accounts={accounts}
        lookups={lookups}
        text={accountText}
        selectedId={selectedAccount?.id || null}
        disabled={saving}
        onTextChange={(value) => {
          setAccountText(value)
          setSelectedId(null)
          setMessage(null)
        }}
        onSelect={(account) => {
          setAccountText(account.name)
          setSelectedId(account.id)
          numbersInputRef.current?.focus()
        }}
        onChooseNew={() => numbersInputRef.current?.focus()}
      />

      {selectedAccount && (
        <p className="pr-account-state existing">
          حساب موجود · {accountInvoices.length} فاتورة مسجلة
        </p>
      )}
      {isNewAccount && (
        <p className="pr-account-state new">
          حساب جديد · رح ينحفظ مع الفواتير
        </p>
      )}

      <label className="pr-field">
        <span>أرقام الفواتير</span>
        <textarea
          ref={numbersInputRef}
          value={numbersText}
          onChange={(event) => {
            setNumbersText(event.target.value)
            setMessage(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              handleSave()
            }
          }}
          placeholder={'رقم بكل سطر، أو افصل بفاصلة أو مسافة\nمثال: 1500, 1508, 1512'}
          rows={3}
          disabled={saving}
        />
      </label>

      {numbers.length > 0 && (
        <ul className="pr-number-chips">
          {numbers.map((number) => {
            const status = getNumberStatus(
              selectedAccount,
              number,
              lookups.invoicesByAccount
            )

            return (
              <li key={number} className={status}>
                {number}
                <small>{STATUS_LABEL[status]}</small>
              </li>
            )
          })}
        </ul>
      )}

      {message && (
        <p className={message.error ? 'pr-message error' : 'pr-message'}>
          {message.text}
        </p>
      )}

      {accountInvoices.length > 0 && (
        <div className="pr-existing-invoices">
          <p className="pr-hint">الفواتير المسجلة لهذا الحساب:</p>
          <ul>
            {accountInvoices.map((invoice) => {
              const count = imagesByInvoice.get(invoice.id)?.length || 0

              return (
                <li key={invoice.id}>
                  {invoice.invoice_number}
                  <small>
                    {invoice.is_archived
                      ? 'مؤرشفة'
                      : count
                        ? `${count} صورة`
                        : 'بدون صور'}
                  </small>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="pr-modal-actions">
        <button
          type="button"
          className="pr-primary"
          onClick={handleSave}
          disabled={!canSave}
        >
          {saving
            ? 'جارٍ الحفظ...'
            : isNewAccount
              ? `حفظ الحساب${newNumbers.length ? ` + ${newNumbers.length} فاتورة` : ''}`
              : `حفظ ${newNumbers.length} فاتورة`}
        </button>
        <button
          type="button"
          className="pr-muted"
          onClick={onClose}
          disabled={saving}
        >
          انتهيت
        </button>
      </div>
    </div>
  )
}

function AccountCombobox({
  inputRef,
  accounts,
  lookups,
  text,
  selectedId,
  disabled,
  onTextChange,
  onSelect,
  onChooseNew
}) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)

  const tokens = getSearchTokens(text)
  const exact = lookups.accountByName.get(normalizeSearchText(text))
  const matches = tokens.length
    ? accounts
        .filter((account) => matchesSearch(account.name, tokens))
        .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
        .slice(0, 8)
    : []
  const showNewOption = tokens.length > 0 && !exact
  const optionCount = matches.length + (showNewOption ? 1 : 0)
  const showList = open && !selectedId && optionCount > 0

  function choose(index) {
    if (index < matches.length) {
      onSelect(matches[index])
    } else {
      onChooseNew()
    }

    setOpen(false)
  }

  return (
    <div className="pr-field pr-combobox">
      <span>اسم الحساب</span>
      <input
        ref={inputRef}
        autoFocus
        value={text}
        disabled={disabled}
        placeholder="اكتب اسم الحساب أو جزء منه"
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          onTextChange(event.target.value)
          setHighlight(0)
          setOpen(true)
        }}
        onKeyDown={(event) => {
          if (!showList) {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (exact) onSelect(exact)
              else if (tokens.length) onChooseNew()
            }
            return
          }

          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setHighlight((value) => (value + 1) % optionCount)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setHighlight(
              (value) => (value - 1 + optionCount) % optionCount
            )
          } else if (event.key === 'Enter') {
            event.preventDefault()
            choose(Math.min(highlight, optionCount - 1))
          } else if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
      />

      {showList && (
        <ul className="pr-dropdown" role="listbox">
          {matches.map((account, index) => (
            <li key={account.id}>
              <button
                type="button"
                className={index === highlight ? 'active' : ''}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
              >
                <strong>{account.name}</strong>
                <small>
                  {(lookups.invoicesByAccount.get(account.id) || []).length}{' '}
                  فاتورة
                </small>
              </button>
            </li>
          ))}
          {showNewOption && (
            <li>
              <button
                type="button"
                className={
                  highlight === matches.length
                    ? 'active pr-dropdown-new'
                    : 'pr-dropdown-new'
                }
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(matches.length)}
              >
                + حساب جديد: «{text.trim()}»
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

// =====================================================
// لصق من Excel: عمود الحساب + عمود (أو أعمدة) أرقام الفواتير
// =====================================================

function ExcelEntry({
  lookups,
  saving,
  setSaving,
  saveEntries,
  onClose
}) {
  const [text, setText] = useState('')
  const [progress, setProgress] = useState(null)
  const [message, setMessage] = useState(null)

  const parsed = useMemo(() => parseExcelText(text), [text])

  const preview = parsed.entries.map((entry) => {
    const account = lookups.accountByName.get(
      normalizeSearchText(entry.name)
    )

    return {
      ...entry,
      account,
      statuses: entry.numbers.map((number) => ({
        number,
        status: getNumberStatus(account, number, lookups.invoicesByAccount)
      }))
    }
  })

  const newAccounts = preview.filter((entry) => !entry.account).length
  const newInvoices = preview.reduce(
    (sum, entry) =>
      sum + entry.statuses.filter((item) => item.status === 'new').length,
    0
  )
  const existingInvoices = preview.reduce(
    (sum, entry) =>
      sum + entry.statuses.filter((item) => item.status !== 'new').length,
    0
  )

  async function handleImport() {
    if (saving || (newAccounts === 0 && newInvoices === 0)) return

    if (
      !window.confirm(
        `حفظ ${newAccounts} حساب جديد و ${newInvoices} فاتورة جديدة؟`
      )
    ) {
      return
    }

    setSaving(true)
    setMessage(null)
    setProgress({ done: 0, total: 1 })

    const result = await saveEntries(parsed.entries, (done, total) =>
      setProgress({ done, total })
    )

    setSaving(false)
    setProgress(null)

    if (result.errors.length) {
      setMessage({
        error: true,
        text: `انحفظ ${result.newAccounts} حساب و ${result.newInvoices} فاتورة. وفي ${result.errors.length} خطأ: ${result.errors.slice(0, 5).join(' — ')}`
      })
      return
    }

    setMessage({
      error: false,
      text: `تم: ${result.newAccounts} حساب جديد، ${result.newInvoices} فاتورة جديدة${result.skipped ? `، ${result.skipped} كانت مسجلة من قبل` : ''}.`
    })
    setText('')
  }

  return (
    <div className="pr-step">
      <p className="pr-hint">
        من Excel انسخ عمودين: <strong>اسم الحساب</strong> ثم{' '}
        <strong>رقم الفاتورة</strong>، والصقهم هون. إذا الحساب نفسه مكرر
        على كذا سطر بينجمعوا تحت حساب واحد، وإذا خانة الحساب فاضية
        بتنحسب على الحساب اللي فوقها.
      </p>

      <textarea
        className="pr-excel-input"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setMessage(null)
        }}
        placeholder={'أحمد خليل\t1500\nأحمد خليل\t1508\nمحمد سعد\t1512'}
        rows={6}
        disabled={saving}
        dir="rtl"
      />

      {parsed.skipped.length > 0 && (
        <p className="pr-message error">
          سطور ما انقرت (لازم يكون فيها عمودين):{' '}
          {parsed.skipped.slice(0, 10).join('، ')}
        </p>
      )}

      {preview.length > 0 && (
        <>
          <p className="pr-preview-summary">
            {preview.length} حساب ({newAccounts} جديد) · {newInvoices} فاتورة
            جديدة
            {existingInvoices > 0 && ` · ${existingInvoices} مسجلة من قبل`}
          </p>

          <ul className="pr-preview-list">
            {preview.map((entry) => (
              <li key={entry.name}>
                <div>
                  <strong>{entry.name}</strong>
                  <small className={entry.account ? 'existing' : 'new'}>
                    {entry.account ? 'موجود' : 'جديد'}
                  </small>
                </div>
                <ul className="pr-number-chips">
                  {entry.statuses.map((item) => (
                    <li key={item.number} className={item.status}>
                      {item.number}
                      <small>{STATUS_LABEL[item.status]}</small>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}

      {progress && (
        <div className="pr-progress">
          <div
            style={{
              width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%`
            }}
          />
          <span>
            {progress.done} من {progress.total}
          </span>
        </div>
      )}

      {message && (
        <p className={message.error ? 'pr-message error' : 'pr-message'}>
          {message.text}
        </p>
      )}

      <div className="pr-modal-actions">
        <button
          type="button"
          className="pr-primary"
          onClick={handleImport}
          disabled={saving || (newAccounts === 0 && newInvoices === 0)}
        >
          {saving
            ? 'جارٍ الحفظ...'
            : `حفظ ${newAccounts} حساب و ${newInvoices} فاتورة`}
        </button>
        <button
          type="button"
          className="pr-muted"
          onClick={onClose}
          disabled={saving}
        >
          انتهيت
        </button>
      </div>
    </div>
  )
}
