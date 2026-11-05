/* DFU progress, in the language selected in the file manager. */
'use strict';
const dfuPhaseLanguages = {
    de_DE: {
        lang: 'de', steps: ['Übertragen', 'Prüfen', 'Abschließen', 'Wiederverbinden'],
        details: ['Der Bootloader empfängt die Daten und bestätigt die empfangenen Bytes.', 'Die Prüfsumme der gesamten Anwendung wird mit dem Gerät verglichen.', 'Die Prüfsumme stimmt. Die Seite wartet auf die Abschlussbestätigung des Bootloaders.', 'Prüfe die Version im Gerätemenü. Öffne dann am Allmiibo die Bluetooth-Dateiübertragung und verbinde es wieder im Dateimanager.'],
        failed: 'Dieser Schritt konnte nicht bestätigt werden. Prüfe die Meldung unten und den Stand am Gerät vor einem neuen Versuch.', open: 'Dateimanager öffnen'
    },
    en: {
        lang: 'en', steps: ['Transfer', 'Verify', 'Finalize', 'Reconnect'],
        details: ['The bootloader is receiving and acknowledging the data.', 'Comparing the checksum of the entire application with the device.', 'Checksum matched. Waiting for the bootloader to confirm completion.', 'Check the version in the device menu. Then open Bluetooth file transfer on the Allmiibo and reconnect in the file manager.'],
        failed: 'This step could not be confirmed. Check the message below and the device before retrying.', open: 'Open file manager'
    },
    es: {
        lang: 'es', steps: ['Transferir', 'Verificar', 'Finalizar', 'Reconectar'],
        details: ['El gestor de arranque está recibiendo y confirmando los datos.', 'Se compara la suma de comprobación de toda la aplicación con la del dispositivo.', 'La suma coincide. Se espera la confirmación final del gestor de arranque.', 'Comprueba la versión en el menú del dispositivo. Abre la transferencia Bluetooth en el Allmiibo y vuelve a conectarlo en el gestor de archivos.'],
        failed: 'No se pudo confirmar este paso. Antes de reintentar, revisa el mensaje y el dispositivo.', open: 'Abrir el gestor de archivos'
    },
    sv_SE: {
        lang: 'sv', steps: ['Överför', 'Verifiera', 'Slutför', 'Anslut igen'],
        details: ['Startladdaren tar emot och bekräftar data.', 'Hela programmets kontrollsumma jämförs med enhetens.', 'Kontrollsumman stämmer. Väntar på startladdarens slutbekräftelse.', 'Kontrollera versionen i enhetens meny. Öppna sedan Bluetooth-filöverföring på Allmiibo och anslut igen i filhanteraren.'],
        failed: 'Steget kunde inte bekräftas. Kontrollera meddelandet och enheten innan du försöker igen.', open: 'Öppna filhanteraren'
    },
    ru_RU: {
        lang: 'ru', steps: ['Передача', 'Проверка', 'Завершение', 'Подключение'],
        details: ['Загрузчик принимает данные и подтверждает их получение.', 'Сравниваются контрольные суммы всего приложения и данных на устройстве.', 'Контрольные суммы совпали. Ожидается подтверждение загрузчика.', 'Проверьте версию в меню устройства. Затем откройте передачу файлов по Bluetooth на Allmiibo и подключитесь в файловом менеджере.'],
        failed: 'Этот шаг не подтверждён. Перед повторной попыткой проверьте сообщение и состояние устройства.', open: 'Открыть файловый менеджер'
    },
    ja_JP: {
        lang: 'ja', steps: ['転送', '検証', '確定', '再接続'],
        details: ['ブートローダーがデータを受信し、受信済みのバイト数を返しています。', 'アプリ全体のチェックサムを端末の値と照合しています。', 'チェックサムが一致しました。ブートローダーの完了応答を待っています。', '端末のメニューでバージョンを確認してください。次に Allmiibo の Bluetooth ファイル転送を開き、ファイルマネージャーで再接続してください。'],
        failed: 'この手順の完了を確認できませんでした。再試行する前に、下のメッセージと端末の状態を確認してください。', open: 'ファイルマネージャーを開く'
    },
    zh_CN: {
        lang: 'zh-Hans', steps: ['传输', '校验', '完成更新', '重新连接'],
        details: ['引导程序正在接收数据并确认已收到的字节。', '正在比对整个应用程序与设备上的校验和。', '校验和一致。正在等待引导程序确认更新完成。', '请在设备菜单中检查版本，然后在 Allmiibo 上打开蓝牙文件传输，并在文件管理器中重新连接。'],
        failed: '未能确认此步骤。重试前请查看下方提示并检查设备状态。', open: '打开文件管理器'
    },
    zh_TW: {
        lang: 'zh-Hant', steps: ['傳輸', '驗證', '完成更新', '重新連線'],
        details: ['開機載入程式正在接收並確認資料。', '正在比對整個應用程式與裝置上的總和檢查碼。', '總和檢查碼相符。正在等候開機載入程式確認更新完成。', '請在裝置選單中確認版本，接著在 Allmiibo 上開啟藍牙檔案傳輸，並在檔案管理員中重新連線。'],
        failed: '無法確認這個步驟。重試前請查看下方訊息並檢查裝置狀態。', open: '開啟檔案管理員'
    }
};
