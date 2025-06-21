else if (mode === 'word') {
    // Split text into words while preserving newlines and spaces
    const wordRegex = /(\S+|\n)/g;
    const words = [];
    let match;
    while ((match = wordRegex.exec(text)) !== null) {
        words.push(match[0]);
    }
    
    const delayPerWord = delay;
    let currentText = '';
    
    for (let i = 0; i < words.length && !stopTyping; i++) {
        if (isPaused) await new Promise(resolve => { typingPromise = resolve; });
        
        currentText += words[i];
        // Add space after words unless it's a newline or last word
        if (words[i] !== '\n' && i < words.length - 1 && words[i+1] !== '\n') {
            currentText += ' ';
        }
        
        if (isRawEditorActive) {
            rawEditor.value = currentText;
        } else {
            editor.setValue(currentText);
        }
        
        lineNumber = currentText.split('\n').length;
        const currentLine = currentText.split('\n').pop();
        column = currentLine.length + 1;
        
        if (!isRawEditorActive) {
            const topLine = Math.max(0, lineNumber - Math.floor((editorHeight / editor.getOption(monaco.editor.EditorOption.lineHeight)) / 2));
            editor.setScrollPosition({ scrollTop: topLine * editor.getOption(monaco.editor.EditorOption.lineHeight) }, monaco.editor.ScrollType.Smooth);
            editor.revealPosition({ lineNumber, column }, monaco.editor.ScrollType.Smooth, { horizontal: true });
            if (typingEffect === 'fade') {
                editor.getDomNode().style.animation = 'typingFade 0.2s ease';
                setTimeout(() => editor.getDomNode().style.animation = '', 200);
            }
        }
        await new Promise(resolve => setTimeout(resolve, delayPerWord));
    }
    
    if (typingEffect === 'fade' && !isRawEditorActive) {
        editor.getDomNode().classList.add('typing-cursor');
        setTimeout(() => editor.getDomNode().classList.remove('typing-cursor'), 1000);
    }
}