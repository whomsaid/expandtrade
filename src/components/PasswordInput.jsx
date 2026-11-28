import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function PasswordInput({
  className = '',
  containerClassName = '',
  id,
  name,
  autoComplete,
  value,
  onChange,
  placeholder,
  required,
  minLength,
  maxLength,
  disabled,
  readOnly,
  'aria-label': ariaLabel,
  ...rest
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  const toggleLabel = visible
    ? t('auth.hidePassword', { defaultValue: 'Hide password' })
    : t('auth.showPassword', { defaultValue: 'Show password' });

  return (
    <div className={`relative w-full ${containerClassName}`}>
      <input
        {...rest}
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        disabled={disabled}
        readOnly={readOnly}
        aria-label={ariaLabel}
        className={`${className} pr-10 [&::-ms-reveal]:hidden [&::-ms-clear]:hidden`}
      />
      <button
        type="button"
        onClick={() => setVisible((prev) => !prev)}
        disabled={disabled}
        aria-label={toggleLabel}
        aria-pressed={visible}
        title={toggleLabel}
        className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 focus:outline-none focus-visible:text-sky-600 dark:focus-visible:text-sky-400 disabled:opacity-40 transition-colors"
      >
        {visible ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
      </button>
    </div>
  );
}
