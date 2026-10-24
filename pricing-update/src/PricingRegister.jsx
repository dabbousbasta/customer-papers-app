import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createPricingAccount,
  createPricingInvoice,
  uploadPricingImage
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

const UPLOAD_WORKERS = 3
let queueSequence = 0

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
  onImageUploaded,
  onClose
}) {
  const [mode, setMode] = useState('single')
  const [saving, setSaving] = useState(false)
  const [pendingImages, setPendingImages] = useState(0)
  const lookups = useLookups(accounts, invoices)

  // الحفظ المشترك: ينشئ الحساب إذا مش موجود، وبعدين الفواتير الجديدة
  async function saveEntries(entries, onProgress) {
    const accountByName = new Map(lookups.accountByName)
    const known = new Map(
      invoices.map((invoice) => [
        `${invoice.account_id}|${invoice.invoice_number}`,
        invoice.id
      ])
    )
    const result = {
      newAccounts: 0,
      newInvoices: 0,
      skipped: 0,
      errors: [],
      // آخر حساب + أرقام فواتيره (للصور)
      account: null,
      invoiceIds: new Map()
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
      result.account = account
      result.invoiceIds = new Map()

      for (const number of entry.numbers) {
        const knownId = known.get(`${account.id}|${number}`)

        if (knownId) {
          result.skipped += 1
          result.invoiceIds.set(number, knownId)
        } else {
          try {
            const invoice = await createPricingInvoice({
              accountId: account.id,
              invoiceNumber: number
            })
            known.set(`${account.id}|${number}`, invoice.id)
            result.invoiceIds.set(number, invoice.id)
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

    if (
      pendingImages > 0 &&
      !window.confirm('في صور لم تُرفع بعد. إغلاق النافذة وتركها؟')
    ) {
      return
    }

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
            onClick={() => {
              if (saving) return
              if (
                pendingImages > 0 &&
                !window.confirm('في صور لم تُرفع بعد. تركها؟')
              ) {
                return
              }
              setPendingImages(0)
              setMode('excel')
            }}
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
            onImageUploaded={onImageUploaded}
            onPendingChange={setPendingImages}
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
  onImageUploaded,
  onPendingChange,
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
  const [deliveryNumber, setDeliveryNumber] = useState('')
  const [targetNumber, setTargetNumber] = useState('')
  const [queue, setQueue] = useState([])
  const [progress, setProgress] = useState(null)
  const accountInputRef = useRef(null)
  const numbersInputRef = useRef(null)
  const deliveryInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const filesInputRef = useRef(null)
  const queueRef = useRef(queue)

  useEffect(() => {
    queueRef.current = queue
    onPendingChange?.(queue.length)
  }, [queue, onPendingChange])

  useEffect(
    () => () => {
      for (const item of queueRef.current) {
        URL.revokeObjectURL(item.previewUrl)
      }
    },
    []
  )

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
  // الفاتورة اللي رح تنضاف إلها الصور الجاية (افتراضيًا آخر رقم مكتوب)
  const activeTarget = numbers.includes(targetNumber)
    ? targetNumber
    : numbers[numbers.length - 1] || ''
  const badImages = queue.filter(
    (item) =>
      !numbers.includes(item.invoiceNumber) ||
      !cleanDocumentNumber(item.deliveryNumber)
  ).length
  const canSave =
    !saving &&
    Boolean(cleanName) &&
    (isNewAccount || newNumbers.length > 0 || queue.length > 0)

  function openPicker(inputRef) {
    if (numbers.length === 0) {
      setMessage({ error: true, text: 'اكتب رقم الفاتورة أولًا' })
      numbersInputRef.current?.focus()
      return
    }

    if (!cleanDocumentNumber(deliveryNumber)) {
      setMessage({ error: true, text: 'اكتب رقم إذن التسليم أولًا' })
      deliveryInputRef.current?.focus()
      return
    }

    setMessage(null)
    inputRef.current?.click()
  }

  function addFiles(fileList) {
    const files = [...(fileList || [])].filter((file) =>
      file.type.startsWith('image/')
    )

    if (files.length === 0) return

    const number = cleanDocumentNumber(deliveryNumber)

    setQueue((current) => [
      ...current,
      ...files.map((file) => {
        queueSequence += 1

        return {
          key: `r${queueSequence}`,
          file,
          previewUrl: URL.createObjectURL(file),
          invoiceNumber: activeTarget,
          deliveryNumber: number,
          status: 'waiting',
          error: ''
        }
      })
    ])
  }

  function updateItem(key, changes) {
    setQueue((current) =>
      current.map((item) =>
        item.key === key ? { ...item, ...changes } : item
      )
    )
  }

  function removeItem(key) {
    setQueue((current) => {
      const item = current.find((entry) => entry.key === key)
      if (item) URL.revokeObjectURL(item.previewUrl)
      return current.filter((entry) => entry.key !== key)
    })
  }

  function addExistingNumber(number) {
    if (numbers.includes(number)) {
      setTargetNumber(number)
      return
    }

    setNumbersText((text) => (text.trim() ? `${text.trim()}\n${number}` : number))
    setTargetNumber(number)
    setMessage(null)
  }

  async function uploadQueue(invoiceIds) {
    const items = queueRef.current.slice()
    let cursor = 0
    let success = 0
    let failed = 0

    setProgress({ done: 0, total: items.length })

    async function worker() {
      while (cursor < items.length) {
        const item = items[cursor]
        cursor += 1

        updateItem(item.key, { status: 'uploading', error: '' })

        try {
          const saved = await uploadPricingImage({
            invoiceId: invoiceIds.get(item.invoiceNumber),
            deliveryNumber: cleanDocumentNumber(item.deliveryNumber),
            file: item.file
          })

          onImageUploaded?.(saved)
          updateItem(item.key, { status: 'done' })
          success += 1
        } catch (uploadError) {
          updateItem(item.key, {
            status: 'failed',
            error: uploadError.message
          })
          failed += 1
        }

        setProgress({ done: success + failed, total: items.length })
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(UPLOAD_WORKERS, items.length) },
        worker
      )
    )

    // نشيل الصور التي نجحت من القائمة
    setQueue((current) => {
      for (const item of current) {
        if (item.status === 'done') URL.revokeObjectURL(item.previewUrl)
      }

      return current.filter((item) => item.status !== 'done')
    })
    setProgress(null)

    return { success, failed }
  }

  async function handleSave() {
    if (!canSave) return

    if (badImages > 0) {
      setMessage({
        error: true,
        text: 'في صور بدون رقم إذن، أو لفاتورة مش مكتوبة بالأرقام. صحّحها تحت الصورة.'
      })
      return
    }

    setSaving(true)
    setMessage(null)

    const result = await saveEntries([
      {
        name: selectedAccount ? selectedAccount.name : cleanName,
        numbers
      }
    ])

    if (result.errors.length || !result.account) {
      setSaving(false)
      setMessage({
        error: true,
        text: `صار خطأ: ${result.errors.join(' — ')}`
      })
      return
    }

    // إذا الحساب كان جديد، نثبّته حتى لو صار خطأ بالصور ونعيد المحاولة
    setSelectedId(result.account.id)
    setAccountText(result.account.name)

    let uploaded = { success: 0, failed: 0 }

    if (queueRef.current.length > 0) {
      uploaded = await uploadQueue(result.invoiceIds)
    }

    setSaving(false)

    const parts = []

    if (result.newAccounts) parts.push('حساب جديد')
    if (result.newInvoices) parts.push(`${result.newInvoices} فاتورة`)
    if (uploaded.success) parts.push(`${uploaded.success} صورة`)

    if (uploaded.failed) {
      setMessage({
        error: true,
        text: `انحفظ ${parts.join('، ') || 'لا شي'}. وفشل رفع ${uploaded.failed} صورة، اضغط «حفظ» مرة ثانية لإعادة المحاولة.`
      })
      return
    }

    setMessage({
      error: false,
      text: `انحفظ لـ «${result.account.name}»: ${parts.join('، ') || 'لا شي جديد'}.${uploaded.success ? '' : ' بتلاقيها بتبويب «بانتظار الصور».'}`
    })
    setAccountText('')
    setSelectedId(null)
    setNumbersText('')
    setDeliveryNumber('')
    setTargetNumber('')
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

            const count = queue.filter(
              (item) => item.invoiceNumber === number
            ).length

            return (
              <li key={number} className={status}>
                {number}
                <small>{STATUS_LABEL[status]}</small>
                {count > 0 && <small className="pr-chip-count">{count} صورة</small>}
              </li>
            )
          })}
        </ul>
      )}

      <section className="pr-register-images">
        <h3>صور أذونات التسليم <small>(اختياري)</small></h3>

        <input
          ref={cameraInputRef}
          className="pr-hidden-input"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => {
            addFiles(event.target.files)
            event.target.value = ''
          }}
        />
        <input
          ref={filesInputRef}
          className="pr-hidden-input"
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => {
            addFiles(event.target.files)
            event.target.value = ''
          }}
        />

        <div className="pr-register-images-row">
          {numbers.length > 1 && (
            <label className="pr-field">
              <span>للفاتورة</span>
              <select
                value={activeTarget}
                onChange={(event) => setTargetNumber(event.target.value)}
                disabled={saving}
              >
                {numbers.map((number) => (
                  <option key={number} value={number}>
                    {number}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="pr-field">
            <span>رقم إذن التسليم</span>
            <input
              ref={deliveryInputRef}
              value={deliveryNumber}
              onChange={(event) => setDeliveryNumber(event.target.value)}
              placeholder="مثال: 320"
              inputMode="numeric"
              disabled={saving}
            />
          </label>
        </div>

        <div className="pr-pick-buttons">
          <button
            type="button"
            onClick={() => openPicker(cameraInputRef)}
            disabled={saving}
          >
            الكاميرا
          </button>
          <button
            type="button"
            onClick={() => openPicker(filesInputRef)}
            disabled={saving}
          >
            من الملفات
          </button>
        </div>

        {queue.length > 0 && (
          <ul className="pr-queue">
            {queue.map((item) => {
              const wrongInvoice = !numbers.includes(item.invoiceNumber)

              return (
                <li key={item.key} className={`pr-queue-item ${item.status}`}>
                  <img src={item.previewUrl} alt="" />
                  <select
                    className={wrongInvoice ? 'pr-invalid' : ''}
                    value={wrongInvoice ? '' : item.invoiceNumber}
                    onChange={(event) =>
                      updateItem(item.key, {
                        invoiceNumber: event.target.value
                      })
                    }
                    disabled={saving}
                    aria-label="الفاتورة لهذه الصورة"
                  >
                    {wrongInvoice && (
                      <option value="">فاتورة؟ ({item.invoiceNumber})</option>
                    )}
                    {numbers.map((number) => (
                      <option key={number} value={number}>
                        فاتورة {number}
                      </option>
                    ))}
                  </select>
                  <input
                    value={item.deliveryNumber}
                    onChange={(event) =>
                      updateItem(item.key, {
                        deliveryNumber: event.target.value
                      })
                    }
                    disabled={saving}
                    aria-label="رقم إذن التسليم لهذه الصورة"
                    placeholder="رقم الإذن"
                  />
                  <small>
                    {item.status === 'waiting' && `إذن ${item.deliveryNumber || '؟'}`}
                    {item.status === 'uploading' && 'جارٍ الرفع...'}
                    {item.status === 'done' && 'تم'}
                    {item.status === 'failed' && `فشل: ${item.error}`}
                  </small>
                  {!saving && (
                    <button
                      type="button"
                      className="pr-queue-remove"
                      onClick={() => removeItem(item.key)}
                      aria-label="إزالة الصورة"
                    >
                      ×
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {progress && (
          <div className="pr-progress">
            <div
              style={{
                width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%`
              }}
            />
            <span>
              رفع الصور {progress.done} من {progress.total}
            </span>
          </div>
        )}
      </section>

      {message && (
        <p className={message.error ? 'pr-message error' : 'pr-message'}>
          {message.text}
        </p>
      )}

      {accountInvoices.length > 0 && (
        <div className="pr-existing-invoices">
          <p className="pr-hint">
            الفواتير المسجلة لهذا الحساب (اضغط على فاتورة لتضيف إلها صور):
          </p>
          <ul>
            {accountInvoices.map((invoice) => {
              const count = imagesByInvoice.get(invoice.id)?.length || 0

              return (
                <li
                  key={invoice.id}
                  role="button"
                  tabIndex={0}
                  className={
                    numbers.includes(invoice.invoice_number) ? 'chosen' : ''
                  }
                  onClick={() =>
                    !saving && addExistingNumber(invoice.invoice_number)
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      addExistingNumber(invoice.invoice_number)
                    }
                  }}
                >
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
            : [
                isNewAccount ? 'حفظ الحساب' : 'حفظ',
                newNumbers.length ? `${newNumbers.length} فاتورة` : '',
                queue.length ? `${queue.length} صورة` : ''
              ]
                .filter(Boolean)
                .join(isNewAccount ? ' + ' : ' + ')
                .replace('حفظ + ', 'حفظ ')}
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
