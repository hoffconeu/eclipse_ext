package com.oje.eclipse.hello.handlers;

import org.eclipse.core.commands.AbstractHandler;
import org.eclipse.core.commands.ExecutionEvent;
import org.eclipse.core.commands.ExecutionException;
import org.eclipse.jface.dialogs.MessageDialog;
import org.eclipse.ui.handlers.HandlerUtil;

public final class HelloHandler extends AbstractHandler {

    @Override
    public Object execute(ExecutionEvent event) throws ExecutionException {
        MessageDialog.openInformation(
            HandlerUtil.getActiveShell(event),
            "OJE Eclipse Extension",
            "Hello World! Die OJE Eclipse Extension wurde erfolgreich installiert."
        );
        return null;
    }
}
