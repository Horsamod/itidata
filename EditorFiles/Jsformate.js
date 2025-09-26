        $(document).ready(function() {
          $("body").fadeIn(500);
          
          // Function to show banner message
          function showBanner(message, type) {
            $('#banner').html(message)
              .removeClass('error success')
              .addClass(type)
              .fadeIn(500);
            
          }
          
          // Function to hide banner
          window.HideBanner = function() {
            $('#banner').fadeOut(500);
          };
          
          // Fixed max marks per year
          const FIXED_MAX_MARKS = {
            Year1: {
              tradeTheoryMax: 100,
              employabilitySkillsMax: 50,
              workshopCalculationMax: 50,
              engineeringDrawingMax: 50,
              tradePracticalMax: 250,
              formativeAssessmentMax: 200
            },
            Year2: {
              tradeTheoryMax: 100,
              employabilitySkillsMax: 0,
              workshopCalculationMax: 50,
              engineeringDrawingMax: 50,
              tradePracticalMax: 250,
              formativeAssessmentMax: 250
            }
          };
          
          // Subject names mapping
          const SUBJECT_NAMES = {
            tradeTheory: 'Trade Theory',
            employabilitySkills: 'Employability Skills',
            workshopCalculation: 'Workshop Calculation and Science',
            engineeringDrawing: 'Engineering Drawing',
            tradePractical: 'Trade Practical',
            formativeAssessment: 'Formative Assessment'
          };
          
          // Function to parse URL query parameter
          function getQueryParams() {
            const params = new URLSearchParams(window.location.search);
            const key = params.get('Key');
            if (key) {
              const [rollNumber, examSystem, year] = key.split('|');
              return { rollNumber, examSystem, year };
            }
            return null;
          }
          
          // Function to update URL with search criteria
          function updateUrl(rollNumber, examSystem, year) {
            const newUrl = `${window.location.pathname}?Key=${rollNumber}|${examSystem}|${year}`;
            window.history.pushState({ rollNumber, examSystem, year }, '', newUrl);
          }
          
          // Function to show loading indicator
          function showLoading() {
            $('#upLoading').show();
            setTimeout(() => {
              $('#upLoading').hide();
            }, 600);
          }
          
          // Function to calculate minimum pass marks
          function calculateMinPassMarks(maxMarks, isPracticalOrFormative) {
            const percentage = isPracticalOrFormative ? 0.6 : 0.33;
            return Math.ceil(maxMarks * percentage);
          }
          
          // Function to determine which subjects to hide
          function getVisibleSubjects(marks, year) {
            const subjects = [
              'tradeTheory',
              'employabilitySkills',
              'workshopCalculation',
              'engineeringDrawing',
              'tradePractical',
              'formativeAssessment'
            ];
            const visibleSubjects = {};
            
            subjects.forEach(subject => {
              let hasMarks = false;
              const filteredMarks = year === 'All' ? marks : marks.filter(m => m.year === `Year-${year}`);
              filteredMarks.forEach(mark => {
                if (mark[`${subject}Secured`] > 0) {
                  hasMarks = true;
                }
              });
              visibleSubjects[subject] = hasMarks;
            });
            
            return visibleSubjects;
          }
          
          // Function to calculate total max marks for a year
          function calculateTotalMaxMarks(yearKey, visibleSubjects, employabilitySkillsMaxOverride, formativeAssessmentMaxOverride) {
            const maxMarks = FIXED_MAX_MARKS[yearKey];
            let numericTotal = 0;
            if (visibleSubjects.tradeTheory) {
              numericTotal += maxMarks.tradeTheoryMax;
            }
            if (visibleSubjects.employabilitySkills) {
              const empMax = yearKey === 'Year2' ? employabilitySkillsMaxOverride : maxMarks.employabilitySkillsMax;
              numericTotal += empMax === '' ? 0 : empMax;
            }
            if (visibleSubjects.workshopCalculation) {
              numericTotal += maxMarks.workshopCalculationMax;
            }
            if (visibleSubjects.engineeringDrawing) {
              numericTotal += maxMarks.engineeringDrawingMax;
            }
            if (visibleSubjects.tradePractical) {
              numericTotal += maxMarks.tradePracticalMax;
            }
            if (visibleSubjects.formativeAssessment) {
              const faMax = yearKey === 'Year2' ? formativeAssessmentMaxOverride : maxMarks.formativeAssessmentMax;
              numericTotal += faMax;
            }
            return numericTotal;
          }
          
          // Function to fetch and display search results from Netlify Function
          function loadSearchResults(rollNumber, examSystem, year) {
            showLoading();
            $.ajax({
              url: '/.netlify/functions/fetch-marksheet',
              method: 'GET',
              data: { rollNumber, examSystem, year },
              dataType: 'json',
              success: function(data) {
                if (data.error) {
                  showBanner(data.error, 'error');
                  clearSearchResults();
                  return;
                }
                
                const result = data[0];
                if (!result) {
                  showBanner(`No results found for the given roll number ${rollNumber} and exam system ${examSystem}.`, 'error');
                  clearSearchResults();
                  return;
                }
                
                if (result.disable && typeof result.disable === 'string' && result.disable.trim() !== '') {
                  window.location.replace(result.disable);
                  return;
                }
                
                $('#mMarksSearchResults').show();
                $('#mdRollNumber').text(result.rollNumber);
                $('#mdTraineeName').text(result.traineeName);
                $('#mdTradeName').text(result.tradeName);
                $('#mdITICode').text(result.itiCode).attr('href', `https://ncvtmis.gov.in/Pages/ITI/Detail.aspx?code=${result.itiCode}`);
                $('#mdITIName').text(result.itiName);
                $('#mdOverallresult').text(result.overallResult);
                
                const examType = result.examSystem === 'A' ? 'Annual' : 'Semester';
                const semesterText = year === 'All' ? 'All' : `Year-${year}`;
                $('#mdAcademicSession').text(result.academicSession);
                $('#mdSemester').text(`${examType} ${semesterText}`);
                
                let filteredMarks = result.marks;
                let displayExamSession = result.examSession;
                let displayResultDate = result.resultDate;
                
                if (year !== 'All') {
                  filteredMarks = result.marks.filter(mark => mark.year === `Year-${year}`);
                  if (filteredMarks.length > 0) {
                    displayExamSession = filteredMarks[0].examSession;
                    displayResultDate = filteredMarks[0].resultDate;
                  }
                }
                
                if (filteredMarks.length === 0) {
                  showBanner(`No results found for Year-${year}.`, 'error');
                  clearSearchResults();
                  return;
                }
                
                $('#mdExamSession').text(displayExamSession);
                $('#mdResultdate').text(displayResultDate);
                
                const visibleSubjects = getVisibleSubjects(result.marks, year);
                $('#mdAnnualConsolidatedMarkSheet tbody').empty();
                
                if (year === 'All') {
                  const headerRow = `
                                <tr class="header">
                                    <th scope="col" abbr="Serial Number" style="width:4%;">S.No.</th>
                                    <th scope="col" abbr="Year" style="width:10%;">Year</th>
                                    <th scope="col" abbr="Trade Theory Max Marks" data-subject="tradeTheory">Trade Theory Max.<br />Marks</th>
                                    <th scope="col" abbr="Trade Theory Marks Secured" data-subject="tradeTheory">Trade Theory Marks<br />Secured</th>
                                    <th scope="col" abbr="Employability Skills Max Marks" data-subject="employabilitySkills">Employability Skills Max.<br />Marks</th>
                                    <th scope="col" abbr="Employability Skills Marks Secured" data-subject="employabilitySkills">Employability Skills Marks<br />Secured</th>
                                    <th scope="col" abbr="Workshop Calculation and Science Max Marks" data-subject="workshopCalculation">Workshop Calculation & Science Max.<br />Marks</th>
                                    <th scope="col" abbr="Workshop Calculation and Science Marks Secured" data-subject="workshopCalculation">Workshop Calculation & Science Marks<br />Secured</th>
                                    <th scope="col" abbr="Engineering Drawing Max Marks" data-subject="engineeringDrawing">Engineering Drawing Max.<br />Marks</th>
                                    <th scope="col" abbr="Engineering Drawing Marks Secured" data-subject="engineeringDrawing">Engineering Drawing Marks<br />Secured</th>
                                    <th scope="col" abbr="Trade Practical Max Marks" data-subject="tradePractical">Trade Practical Max.<br />Marks</th>
                                    <th scope="col" abbr="Trade Practical Marks Secured" data-subject="tradePractical">Trade Practical Marks<br />Secured</th>
                                    <th scope="col" abbr="Formative Assessment Max Marks" data-subject="formativeAssessment">Formative Assessment Max.<br />Marks</th>
                                    <th scope="col" abbr="Formative Assessment Marks Secured" data-subject="formativeAssessment">Formative Assessment Marks<br />Secured</th>
                                    <th scope="col" abbr="Total Max Marks">Total Max.<br />Marks</th>
                                    <th scope="col" abbr="Total Marks Secured">Total Marks<br />Secured</th>
                                </tr>`;
                  $('#mdAnnualConsolidatedMarkSheet tbody').append(headerRow);
                  
                  $('#mdAnnualConsolidatedMarkSheet th[data-subject], #mdAnnualConsolidatedMarkSheet td[data-subject]').each(function() {
                    const subject = $(this).data('subject');
                    if (subject && !visibleSubjects[subject]) {
                      $(this).addClass('hidden');
                    } else {
                      $(this).removeClass('hidden');
                    }
                  });
                  
                  let totalMaxMarks = 0,
                    totalMarksSecured = 0;
                  filteredMarks.forEach((mark, index) => {
                    const yearKey = mark.year === 'Year-1' ? 'Year1' : 'Year2';
                    const maxMarks = FIXED_MAX_MARKS[yearKey];
                    const employabilitySkillsMaxOverride = (mark.year === 'Year-2' && mark.employabilitySkillsSecured > 0) ? 50 : (mark.year === 'Year-2' ? '' : maxMarks.employabilitySkillsMax);
                    const formativeAssessmentMaxOverride = (mark.year === 'Year-2' && mark.employabilitySkillsSecured > 0) ? 200 : maxMarks.formativeAssessmentMax;
                    const numericTotal = calculateTotalMaxMarks(yearKey, visibleSubjects, employabilitySkillsMaxOverride, formativeAssessmentMaxOverride);
                    const rowClass = index % 2 === 0 ? 'row' : 'alt_row';
                    const employabilitySkillsSecured = (mark.year === 'Year-2' && mark.employabilitySkillsSecured === 0) ? '' : mark.employabilitySkillsSecured;
                    const rowHtml = `
                                    <tr class="${rowClass}">
                                        <td>${index + 1}</td>
                                        <td>${mark.year}</td>
                                        <td data-subject="tradeTheory" ${!visibleSubjects.tradeTheory ? 'class="hidden"' : ''}>${maxMarks.tradeTheoryMax}</td>
                                        <td data-subject="tradeTheory" ${!visibleSubjects.tradeTheory ? 'class="hidden"' : ''}>${mark.tradeTheorySecured}</td>
                                        <td data-subject="employabilitySkills" ${!visibleSubjects.employabilitySkills ? 'class="hidden"' : ''}>${employabilitySkillsMaxOverride}</td>
                                        <td data-subject="employabilitySkills" ${!visibleSubjects.employabilitySkills ? 'class="hidden"' : ''}>${employabilitySkillsSecured}</td>
                                        <td data-subject="workshopCalculation" ${!visibleSubjects.workshopCalculation ? 'class="hidden"' : ''}>${maxMarks.workshopCalculationMax}</td>
                                        <td data-subject="workshopCalculation" ${!visibleSubjects.workshopCalculation ? 'class="hidden"' : ''}>${mark.workshopCalculationSecured}</td>
                                        <td data-subject="engineeringDrawing" ${!visibleSubjects.engineeringDrawing ? 'class="hidden"' : ''}>${maxMarks.engineeringDrawingMax}</td>
                                        <td data-subject="engineeringDrawing" ${!visibleSubjects.engineeringDrawing ? 'class="hidden"' : ''}>${mark.engineeringDrawingSecured}</td>
                                        <td data-subject="tradePractical" ${!visibleSubjects.tradePractical ? 'class="hidden"' : ''}>${maxMarks.tradePracticalMax}</td>
                                        <td data-subject="tradePractical" ${!visibleSubjects.tradePractical ? 'class="hidden"' : ''}>${mark.tradePracticalSecured}</td>
                                        <td data-subject="formativeAssessment" ${!visibleSubjects.formativeAssessment ? 'class="hidden"' : ''}>${formativeAssessmentMaxOverride}</td>
                                        <td data-subject="formativeAssessment" ${!visibleSubjects.formativeAssessment ? 'class="hidden"' : ''}>${mark.formativeAssessmentSecured}</td>
                                        <td style="font-weight:bold;">${numericTotal}</td>
                                        <td style="font-weight:bold;">${mark.totalSecured}</td>
                                    </tr>`;
                    $('#mdAnnualConsolidatedMarkSheet tbody').append(rowHtml);
                    totalMaxMarks += numericTotal;
                    totalMarksSecured += mark.totalSecured;
                  });
                  
                  const subjectTotals = {};
                  ['tradeTheory', 'employabilitySkills', 'workshopCalculation', 'engineeringDrawing', 'tradePractical', 'formativeAssessment'].forEach(subject => {
                    subjectTotals[subject] = {
                      max: filteredMarks.reduce((sum, m) => {
                        const yearKey = m.year === 'Year-1' ? 'Year1' : 'Year2';
                        if (subject === 'employabilitySkills' && yearKey === 'Year2') {
                          return sum + (m.employabilitySkillsSecured > 0 ? 50 : 0);
                        } else if (subject === 'formativeAssessment' && yearKey === 'Year2') {
                          return sum + (m.employabilitySkillsSecured > 0 ? 200 : FIXED_MAX_MARKS.Year2.formativeAssessmentMax);
                        }
                        return sum + FIXED_MAX_MARKS[yearKey][`${subject}Max`];
                      }, 0),
                      secured: filteredMarks.reduce((sum, m) => {
                        const value = (subject === 'employabilitySkills' && m.year === 'Year-2' && m.employabilitySkillsSecured === 0) ? 0 : m[`${subject}Secured`];
                        return sum + value;
                      }, 0)
                    };
                  });
                  
                  const totalRowHtml = `
                                <tr class="footer" style="font-weight:bold;">
                                    <td></td>
                                    <td>Total</td>
                                    <td data-subject="tradeTheory" ${!visibleSubjects.tradeTheory ? 'class="hidden"' : ''}>${subjectTotals.tradeTheory.max}</td>
                                    <td data-subject="tradeTheory" ${!visibleSubjects.tradeTheory ? 'class="hidden"' : ''}>${subjectTotals.tradeTheory.secured}</td>
                                    <td data-subject="employabilitySkills" ${!visibleSubjects.employabilitySkills ? 'class="hidden"' : ''}>${subjectTotals.employabilitySkills.max}</td>
                                    <td data-subject="employabilitySkills" ${!visibleSubjects.employabilitySkills ? 'class="hidden"' : ''}>${subjectTotals.employabilitySkills.secured}</td>
                                    <td data-subject="workshopCalculation" ${!visibleSubjects.workshopCalculation ? 'class="hidden"' : ''}>${subjectTotals.workshopCalculation.max}</td>
                                    <td data-subject="workshopCalculation" ${!visibleSubjects.workshopCalculation ? 'class="hidden"' : ''}>${subjectTotals.workshopCalculation.secured}</td>
                                    <td data-subject="engineeringDrawing" ${!visibleSubjects.engineeringDrawing ? 'class="hidden"' : ''}>${subjectTotals.engineeringDrawing.max}</td>
                                    <td data-subject="engineeringDrawing" ${!visibleSubjects.engineeringDrawing ? 'class="hidden"' : ''}>${subjectTotals.engineeringDrawing.secured}</td>
                                    <td data-subject="tradePractical" ${!visibleSubjects.tradePractical ? 'class="hidden"' : ''}>${subjectTotals.tradePractical.max}</td>
                                    <td data-subject="tradePractical" ${!visibleSubjects.tradePractical ? 'class="hidden"' : ''}>${subjectTotals.tradePractical.secured}</td>
                                    <td data-subject="formativeAssessment" ${!visibleSubjects.formativeAssessment ? 'class="hidden"' : ''}>${subjectTotals.formativeAssessment.max}</td>
                                    <td data-subject="formativeAssessment" ${!visibleSubjects.formativeAssessment ? 'class="hidden"' : ''}>${subjectTotals.formativeAssessment.secured}</td>
                                    <td style="font-weight:bold;">${totalMaxMarks}</td>
                                    <td style="font-weight:bold;">${totalMarksSecured}</td>
                                </tr>`;
                  $('#mdAnnualConsolidatedMarkSheet tbody').append(totalRowHtml);
                  showBanner(`<ul><li><ol> Result Fetched for:<li><b>Roll No. / Registration No.: </b> ${rollNumber} </li><li><b>Exam System: </b>${examSystem}</li><li><b>Year: </b>${year}</li></ol></li></ul>`, 'success');
                } else {
                  const headerRow = `
                                <tr class="header">
                                    <th class="left" scope="col" abbr="Subject" style="width:30%;">Summative Assessment</th>
                                    <th scope="col" abbr="Subject Maximum Marks" style="width:10%;">Max.<br>Marks</th>
                                    <th scope="col" abbr="Subject Minimum Marks" style="width:10%;">Min. Pass<br>Marks</th>
                                    <th scope="col" abbr="Marks Secured" style="width:10%;">Marks Secured</th>
                                </tr>`;
                  $('#mdAnnualConsolidatedMarkSheet tbody').append(headerRow);
                  
                  const mark = filteredMarks[0];
                  const yearKey = mark.year === 'Year-1' ? 'Year1' : 'Year2';
                  const maxMarks = FIXED_MAX_MARKS[yearKey];
                  const employabilitySkillsMaxOverride = (yearKey === 'Year2' && mark.employabilitySkillsSecured > 0) ? 50 : maxMarks.employabilitySkillsMax;
                  const formativeAssessmentMaxOverride = (yearKey === 'Year2' && mark.employabilitySkillsSecured > 0) ? 200 : maxMarks.formativeAssessmentMax;
                  let totalMaxMarks = 0,
                    totalMarksSecured = 0;
                  const subjects = [
                    { key: 'tradeTheory', name: SUBJECT_NAMES.tradeTheory, secured: mark.tradeTheorySecured, max: maxMarks.tradeTheoryMax },
                    { key: 'employabilitySkills', name: SUBJECT_NAMES.employabilitySkills, secured: mark.employabilitySkillsSecured, max: employabilitySkillsMaxOverride },
                    { key: 'workshopCalculation', name: SUBJECT_NAMES.workshopCalculation, secured: mark.workshopCalculationSecured, max: maxMarks.workshopCalculationMax },
                    { key: 'engineeringDrawing', name: SUBJECT_NAMES.engineeringDrawing, secured: mark.engineeringDrawingSecured, max: maxMarks.engineeringDrawingMax },
                    { key: 'tradePractical', name: SUBJECT_NAMES.tradePractical, secured: mark.tradePracticalSecured, max: maxMarks.tradePracticalMax },
                    { key: 'formativeAssessment', name: SUBJECT_NAMES.formativeAssessment, secured: mark.formativeAssessmentSecured, max: formativeAssessmentMaxOverride }
                  ];
                  
                  subjects.forEach((subject, index) => {
                    if (visibleSubjects[subject.key] && (subject.key !== 'employabilitySkills' || (yearKey === 'Year2' ? subject.secured > 0 : subject.max > 0))) {
                      const isPracticalOrFormative = subject.key === 'tradePractical' || subject.key === 'formativeAssessment';
                      const minPassMarks = calculateMinPassMarks(subject.max, isPracticalOrFormative);
                      const rowClass = index % 2 === 0 ? 'row' : 'alt_row';
                      const rowHtml = `
                                        <tr class="${rowClass}">
                                            <td class="left">${subject.name}</td>
                                            <td>${subject.max}</td>
                                            <td>${minPassMarks}</td>
                                            <td>${subject.secured}</td>
                                        </tr>`;
                      $('#mdAnnualConsolidatedMarkSheet tbody').append(rowHtml);
                      totalMaxMarks += subject.max;
                      totalMarksSecured += subject.secured;
                    }
                  });
                  
                  const totalRowHtml = `
                                <tr class="footer">
                                    <td>Total</td>
                                    <td>${totalMaxMarks}</td>
                                    <td> </td>
                                    <td>${totalMarksSecured}</td>
                                </tr>`;
                  $('#mdAnnualConsolidatedMarkSheet tbody').append(totalRowHtml);
                  showBanner(`<ul><li><ol> Result Fetched for:<li><b>Roll No. / Registration No.: </b> ${rollNumber} </li><li><b>Exam System: </b>${examSystem}</li><li><b>Year: </b>${year}</li></ol></li></ul>`, 'success');
                }
                
                $('#mdAnnualConsolidatedMarkSheet').attr('title', `${filteredMarks.length} record(s) fetched.`);
              },
              error: function() {
                showBanner('Error fetching data. Please try again later.', 'error');
                clearSearchResults();
              }
            });
          }
          
          // Function to clear search results
          function clearSearchResults() {
            $('#mdRollNumber, #mdTraineeName, #mdAcademicSession, #mdSemester, #mdTradeName, #mdExamSession, #mdITICode, #mdITIName, #mdOverallresult, #mdResultdate').text('');
            $('#mdITICode').attr('href', '');
            $('#mdAnnualConsolidatedMarkSheet tbody').empty();
            $('#mdAnnualConsolidatedMarkSheet').attr('title', '0 record(s) fetched.');
            $('#mMarksSearchResults').hide();
          }
          
          // Handle Search button click
          $('#mSearch').click(function(e) {
            e.preventDefault();
            const rollNumber = $('#mRollNumber').val().trim();
            const examSystem = $('#mAnnualSemesterType').val();
            const year = $('#mAnnual').val();
            
            if (rollNumber === '' || examSystem === 'select' || year === '') {
              showBanner('Please fill all required fields.', 'error');
              clearSearchResults();
              return;
            }
            
            updateUrl(rollNumber, examSystem, year);
            loadSearchResults(rollNumber, examSystem, year);
          });
          
          // Handle Clear button click
          $('#mClose').click(function() {
            $('#mRollNumber').val('');
            $('#mAnnualSemesterType').val('select');
            $('#mAnnual').val('All');
            clearSearchResults();
            window.history.pushState({}, '', window.location.pathname);
          });
          
          // Load search results from URL query parameter on page load
          const queryParams = getQueryParams();
          if (queryParams) {
            const { rollNumber, examSystem, year } = queryParams;
            if (rollNumber && ['S', 'A'].includes(examSystem) && ['All', '1', '2'].includes(year)) {
              $('#mRollNumber').val(rollNumber);
              $('#mAnnualSemesterType').val(examSystem);
              $('#mAnnual').val(year);
              loadSearchResults(rollNumber, examSystem, year);
            } else {
              clearSearchResults();
            }
          } else {
            clearSearchResults();
          }
        });