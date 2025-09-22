# Настройка для Fish Shell

## 🐟 Проблема с Fish Shell

Fish shell имеет другой синтаксис, чем bash/zsh, поэтому стандартная активация виртуального окружения не работает.

## ✅ Решение

### Вариант 1: Использование Python напрямую (рекомендуется)

```fish
# Перейдите в папку проекта
cd /Users/keytron46/Documents/GitHub/django-faceid

# Разрешите direnv
direnv allow

# Используйте Python из виртуального окружения напрямую
.venv/bin/python manage.py runserver 0.0.0.0:8000
```

### Вариант 2: Установка virtualfish (альтернатива)

```fish
# Установите virtualfish
pip install virtualfish

# Создайте виртуальное окружение
vf new django-faceid

# Активируйте окружение
vf activate django-faceid

# Установите зависимости
pip install -r requirements.txt

# Запустите сервер
python manage.py runserver 0.0.0.0:8000
```

### Вариант 3: Переключение на bash/zsh

```fish
# Временно переключитесь на bash
bash

# Активируйте окружение
source .venv/bin/activate

# Запустите сервер
python manage.py runserver 0.0.0.0:8000
```

## 🚀 Быстрый запуск для Fish

```fish
cd /Users/keytron46/Documents/GitHub/django-faceid
direnv allow
.venv/bin/python manage.py runserver 0.0.0.0:8000
```

## 📝 Полезные команды для Fish

```fish
# Проверить, что Python работает
.venv/bin/python --version

# Установить новые пакеты
.venv/bin/pip install package_name

# Запустить миграции
.venv/bin/python manage.py migrate

# Собрать статику
.venv/bin/python manage.py collectstatic --noinput
```

## 🔧 Настройка Fish для удобства

Добавьте в `~/.config/fish/config.fish`:

```fish
# Автоматическая активация виртуального окружения
function activate_venv
    if test -f .venv/bin/activate.fish
        source .venv/bin/activate.fish
    else
        echo "Используйте: .venv/bin/python вместо python"
    end
end

# Алиас для удобства
alias djrun=".venv/bin/python manage.py runserver 0.0.0.0:8000"
alias djtest=".venv/bin/python manage.py test"
alias djshell=".venv/bin/python manage.py shell"
```

## ⚠️ Важные замечания

1. **direnv работает**: Fish поддерживает direnv, поэтому переменные окружения загружаются автоматически
2. **Python из .venv**: Всегда используйте `.venv/bin/python` вместо `python`
3. **pip из .venv**: Используйте `.venv/bin/pip` для установки пакетов

## 🎯 Готово!

Сервер должен запуститься на http://localhost:8000

Откройте в браузере:
- http://localhost:8000/faceid/enroll/ — запись шаблона
- http://localhost:8000/faceid/verify/ — верификация
