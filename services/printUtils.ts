// Utility to trigger a "Save as PDF" download from an HTML string by using
// the browser's native print engine. This produces a real PDF (vector text,
// proper pagination) without needing any extra library or server-side
// PDF rendering infrastructure.
//
// The browser print dialog defaults to "Save as PDF" in Chromium-based
// browsers (Chrome/Edge/Brave/Opera) and offers it as an option in Firefox
// and Safari, so the user can save the invoice as a PDF in one click.

export function printHtmlAsPdf(html: string, suggestedFilename?: string): void {
  // Inject the suggested filename as the document title so that the browser's
  // "Save as PDF" dialog uses it as the default file name.
  let finalHtml = html;
  if (suggestedFilename) {
    const safeTitle = suggestedFilename.replace(/[<>]/g, '');
    if (/<title>[\s\S]*?<\/title>/i.test(finalHtml)) {
      finalHtml = finalHtml.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
    } else if (/<head[^>]*>/i.test(finalHtml)) {
      finalHtml = finalHtml.replace(/<head[^>]*>/i, (m) => `${m}<title>${safeTitle}</title>`);
    }
  }

  // Inject a small script that triggers print() once the page is fully loaded
  // (including images / fonts). The parent page listens for the resulting
  // afterprint event via postMessage to clean up the iframe.
  const printScript = `
    <script>
      (function() {
        function doPrint() {
          try {
            window.focus();
            window.print();
          } catch (e) {
            try { window.parent.postMessage({ type: 'invoice-print-error', error: String(e) }, '*'); } catch (_) {}
          }
        }
        window.addEventListener('afterprint', function() {
          try { window.parent.postMessage({ type: 'invoice-print-done' }, '*'); } catch (_) {}
        });
        if (document.readyState === 'complete') {
          setTimeout(doPrint, 100);
        } else {
          window.addEventListener('load', function() { setTimeout(doPrint, 100); });
        }
      })();
    <\/script>
  `;

  if (/<\/body>/i.test(finalHtml)) {
    finalHtml = finalHtml.replace(/<\/body>/i, `${printScript}</body>`);
  } else {
    finalHtml = finalHtml + printScript;
  }

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('tabindex', '-1');

  const cleanup = () => {
    window.removeEventListener('message', onMessage);
    if (iframe.parentNode) {
      try { iframe.parentNode.removeChild(iframe); } catch (_) { /* noop */ }
    }
  };

  const onMessage = (ev: MessageEvent) => {
    const data: any = ev.data;
    if (data && (data.type === 'invoice-print-done' || data.type === 'invoice-print-error')) {
      // Delay removal slightly so the print dialog isn't interrupted on
      // browsers that resolve afterprint before the dialog is fully closed.
      setTimeout(cleanup, 300);
    }
  };
  window.addEventListener('message', onMessage);

  // Safety net: clean up after 5 minutes in case the user dismisses the
  // dialog without printing (some browsers don't fire afterprint then).
  setTimeout(cleanup, 5 * 60 * 1000);

  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    cleanup();
    throw new Error('No se pudo crear el contexto de impresión');
  }
  doc.open();
  doc.write(finalHtml);
  doc.close();
}

export async function downloadInvoicePdf(htmlResponse: Response, invoiceNumber?: string | number): Promise<void> {
  const html = await htmlResponse.text();
  const filename = invoiceNumber ? `factura-${invoiceNumber}` : 'factura';
  printHtmlAsPdf(html, filename);
}
