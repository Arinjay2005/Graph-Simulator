import React from 'react';

const Graph_Input = ({
  matrixInput,
  setMatrixInput,
  listInput,
  setListInput,
  isWeighted,
  mappingText,
  onFileUpload,
  onExport,
  onMatrixSubmit,
  onListSubmit,
  styles,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
      <div style={styles.panel}>
        <div style={styles.headerRow}>
          <div>
            <h3 style={styles.panelTitle}>Adjacency Matrix</h3>
            {mappingText && (
              <span style={styles.mappingLabel}>
                Rows/Cols map to IDs: <strong>{mappingText}</strong>
              </span>
            )}
          </div>
          <div style={styles.fileBtnCluster}>
            <input type="file" id="matrix-upload" accept=".txt" onChange={(e) => onFileUpload(e, setMatrixInput)} style={styles.hiddenInput} />
            <label htmlFor="matrix-upload" style={styles.btnFile}>📁 Upload</label>
            <button onClick={() => onExport(matrixInput, 'adjacency_matrix.txt')} style={styles.btnFile}>💾 Download</button>
          </div>
        </div>
        <textarea
          rows={6}
          style={styles.textArea}
          value={matrixInput}
          onChange={(e) => setMatrixInput(e.target.value)}
          placeholder={isWeighted ? '0 5 12\n5 0 0\n12 0 0' : '0 1 1\n1 0 0\n1 0 0'}
        />
        <button onClick={onMatrixSubmit} style={styles.btnPrimary}>Draw from Matrix</button>
      </div>

      <div style={styles.panel}>
        <div style={styles.headerRow}>
          <div>
            <h3 style={styles.panelTitle}>Adjacency List</h3>
          </div>
          <div style={styles.fileBtnCluster}>
            <input type="file" id="list-upload" accept=".txt" onChange={(e) => onFileUpload(e, setListInput)} style={styles.hiddenInput} />
            <label htmlFor="list-upload" style={styles.btnFile}>📁 Upload</label>
            <button onClick={() => onExport(listInput, 'adjacency_list.txt')} style={styles.btnFile}>💾 Download</button>
          </div>
        </div>
        <textarea
          rows={6}
          style={styles.textArea}
          value={listInput}
          onChange={(e) => setListInput(e.target.value)}
          placeholder={isWeighted ? '1: 2(5), 3(12)\n2: 1(5)\n3: 1(12)' : '1: 2, 3\n2: 1\n3: 1'}
        />
        <button onClick={onListSubmit} style={styles.btnPrimary}>Draw from List</button>
      </div>
    </div>
  );
};

export default Graph_Input;