package com.oje.eclipse.hello.handlers;

import org.eclipse.core.commands.AbstractHandler;
import org.eclipse.core.commands.ExecutionEvent;
import org.eclipse.core.commands.ExecutionException;
import org.eclipse.jface.dialogs.MessageDialog;
import org.eclipse.jface.text.ITextSelection;
import org.eclipse.jface.viewers.ISelection;
import org.eclipse.jface.viewers.ISelectionProvider;
import org.eclipse.ui.IEditorPart;
import org.eclipse.ui.handlers.HandlerUtil;
import org.eclipse.ui.texteditor.ITextEditor;

/** Checks a deliberate text selection without copying or transmitting it. */
public final class SourceSelectionHandler extends AbstractHandler {

    @Override
    public Object execute(ExecutionEvent event) throws ExecutionException {
        IEditorPart editor = HandlerUtil.getActiveEditor(event);
        ITextEditor textEditor = editor instanceof ITextEditor direct
            ? direct : editor == null ? null : editor.getAdapter(ITextEditor.class);
        if (textEditor == null) {
            MessageDialog.openInformation(HandlerUtil.getActiveShell(event),
                "OJE Quelltext-Auswahl", "Bitte zuerst einen ABAP-Quelltexteditor oeffnen.");
            return null;
        }

        ISelectionProvider provider = textEditor.getSelectionProvider();
        ISelection selection = provider == null ? null : provider.getSelection();
        if (!(selection instanceof ITextSelection selected) || selected.getLength() == 0) {
            MessageDialog.openInformation(HandlerUtil.getActiveShell(event),
                "OJE Quelltext-Auswahl", "Bitte Quelltext im Editor markieren."
                    + " Ohne Markierung wird kein ganzes Objekt erfasst.");
            return null;
        }

        MessageDialog.openInformation(HandlerUtil.getActiveShell(event),
            "OJE Quelltext-Auswahl – lokaler Test",
            "Editor: " + editor.getTitle() + "\nMarkiert: " + selected.getLength()
                + " Zeichen\n\nEs wurde nichts kopiert, gespeichert oder uebertragen.");
        return null;
    }
}
