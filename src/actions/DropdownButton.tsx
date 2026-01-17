import * as React from 'react';

export interface IDropdownOption {
  label: string;
  onClick: () => void;
}

interface IDropdownButtonProps {
  options: IDropdownOption[];
  className?: string;
}

export function DropdownButton({
  options,
  className
}: IDropdownButtonProps): React.ReactElement {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleOptionClick = (option: IDropdownOption) => {
    option.onClick();
    setIsOpen(false);
  };

  const primaryOption = options[0];

  return (
    <div className="jp-Mynerva-dropdown" ref={dropdownRef}>
      <div className="jp-Mynerva-dropdown-buttons">
        <button
          className={`jp-Mynerva-action-button jp-Mynerva-dropdown-main${className ? ` ${className}` : ''}`}
          onClick={primaryOption.onClick}
        >
          {primaryOption.label}
        </button>
        {options.length > 1 && (
          <button
            className={`jp-Mynerva-action-button jp-Mynerva-dropdown-toggle${className ? ` ${className}` : ''}`}
            onClick={() => setIsOpen(!isOpen)}
          >
            ▼
          </button>
        )}
      </div>
      {isOpen && options.length > 1 && (
        <div className="jp-Mynerva-dropdown-menu">
          {options.slice(1).map((option, index) => (
            <button
              key={index}
              className="jp-Mynerva-dropdown-item"
              onClick={() => handleOptionClick(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
