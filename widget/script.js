/**
 * Avito by ko:agency — фронтенд виджета (каркас).
 * Публичная сборка: глобальный объект amo, вывод в консоль и системные диалоги запрещены валидатором amoМаркета (см. scripts/package_widget.sh).
 * Все данные аккаунта (воронки, пользователи) берём с бэкенда: GET /api/amo/bootstrap.
 * Экран настроек — этап 1 (docs/PLAN.md).
 */
define(['jquery'], function ($) {
  return function () {
    var self = this;
    var BACKEND = 'https://avito.koagency.me';

    function t(key) {
      var ui = self.i18n('ui') || {};
      return ui[key] || key;
    }

    function renderShell($root) {
      $root.html(
        '<div class="koavito">' +
          '<h3 class="koavito__title">' + t('accounts') + '</h3>' +
          '<div class="koavito__body">' + t('loading') + '</div>' +
          '<a class="button-input koavito__connect" target="_blank" rel="noopener" href="' +
            BACKEND + '/oauth/avito/start">' + t('connect_avito') + '</a>' +
        '</div>'
      );
    }

    this.callbacks = {
      render: function () { return true; },
      init: function () { return true; },
      bind_actions: function () { return true; },
      settings: function () { return true; },
      advancedSettings: function () {
        var $root = $('#work-area-' + self.get_settings().widget_code);
        if ($root.length) renderShell($root);
        return true;
      },
      onSave: function () { return true; },
      destroy: function () { return true; }
    };
    return this;
  };
});
